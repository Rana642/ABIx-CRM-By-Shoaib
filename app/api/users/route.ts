import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { actorOf, denied, recordDenied, can } from '@/lib/access';
import { hashToken, newToken } from '@/lib/session';
import { BASE_URL } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// Users & Access (Serge, 18 Sept): invite people, assign workspaces and roles, review access,
// suspend and revoke. Every change goes through abix.fn_access_admin, which enforces who may do what
// (only the Owner grants portfolio-wide access, sensitive data, exports or delegation) and records it.

function friendly(message: string): string {
  const m = /^[A-Z_]+: ([\s\S]+)$/.exec(message);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : `Something went wrong: ${message}`;
}

export async function GET(req: NextRequest) {
  const actor = actorOf(req);
  if (!(await can(actor, 'users.manage', null))) {
    await recordDenied(actor, 'view Users & Access', 'users.manage', null);
    return denied();
  }
  const [users, assignments, grants, invitations, roles, companies, audit] = await Promise.all([
    pool.query(
      `SELECT username, display_name, email, status, is_owner, can_manage_users, mfa_required, mfa_enabled,
              access_expires_at, invited_by, created_at, last_login_at
         FROM abix.console_users ORDER BY is_owner DESC, status = 'revoked', display_name`
    ),
    pool.query(
      `SELECT a.assignment_id, a.username, a.company_id, c.display_name AS company, a.role_code, r.name AS role,
              a.granted_by, a.granted_at, a.expires_at, a.expires_at IS NOT NULL AND a.expires_at <= now() AS expired, a.note
         FROM abix.access_assignments a
         JOIN abix.access_roles r USING (role_code)
         LEFT JOIN abix.companies c USING (company_id)
        WHERE a.revoked_at IS NULL ORDER BY a.username, c.display_name NULLS FIRST`
    ),
    pool.query(
      `SELECT g.grant_id, g.username, g.permission_code, c.display_name AS company, g.granted_by, g.granted_at, g.expires_at
         FROM abix.access_user_grants g LEFT JOIN abix.companies c USING (company_id)
        WHERE g.revoked_at IS NULL ORDER BY g.username`
    ),
    pool.query(
      `SELECT i.username, u.email, i.invited_by, i.created_at, i.expires_at, i.expires_at <= now() AS expired,
              (SELECT max(m.created_at) FROM abix.mail_outbox m
                WHERE m.about_user = i.username AND m.purpose = 'invitation') AS emailed_at
         FROM abix.console_invitations i JOIN abix.console_users u USING (username)
        WHERE i.accepted_at IS NULL AND i.revoked_at IS NULL ORDER BY i.created_at DESC`
    ),
    pool.query(`SELECT role_code, name, description FROM abix.access_roles WHERE role_code <> 'owner' ORDER BY rank`),
    pool.query(`SELECT company_id, display_name AS name, company_code AS code FROM abix.companies ORDER BY display_name`),
    pool.query(
      `SELECT at, actor, action, target, c.display_name AS company, permission, outcome, detail
         FROM abix.access_audit a LEFT JOIN abix.companies c USING (company_id)
        ORDER BY at DESC LIMIT 150`
    ),
  ]);
  const meRow = await pool.query('SELECT is_owner FROM abix.console_users WHERE username = $1', [actor]);
  return NextResponse.json({
    me: { username: actor, is_owner: meRow.rows[0]?.is_owner === true },
    users: users.rows,
    assignments: assignments.rows,
    grants: grants.rows,
    invitations: invitations.rows,
    roles: roles.rows,
    companies: companies.rows,
    audit: audit.rows,
  });
}

const ACTIONS = ['invite', 'reinvite', 'restore', 'assign', 'unassign', 'grant', 'ungrant', 'suspend',
                 'reactivate', 'revoke', 'reset_mfa', 'set_delegate', 'set_mfa_required', 'set_expiry',
                 'set_email'];
const INVITING = ['invite', 'reinvite', 'restore'];

// The invitation reaches the person by email when their account has one; the link is also shown once
// to whoever created it, so an invitation can still be passed on by hand.
function invitationEmail(name: string, username: string, link: string, hours = 72) {
  return {
    subject: 'Your invitation to the Aya console',
    body: `Hello ${name},

You have been invited to the Aya console for ABIx Group.

Open this link to choose your password and set up two-step sign-in:
${link}

The link works once and expires in ${hours} hours. Your user name is: ${username}
Afterwards, sign in at ${BASE_URL}/login

If you were not expecting this invitation, ignore this message and tell Serge.`,
  };
}

export async function POST(req: NextRequest) {
  const actor = actorOf(req);
  const body = await req.json().catch(() => ({}));
  if (!ACTIONS.includes(body.action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });

  // An invitation link is shown once, to the person who created it; only its hash is stored.
  let link: string | null = null;
  const p: Record<string, unknown> = { ...body, actor };
  if (INVITING.includes(body.action)) {
    const token = newToken();
    p.invitation_token_hash = hashToken(token);
    link = `${BASE_URL}/invite?token=${token}`;
  }
  try {
    const { rows } = await pool.query('SELECT abix.fn_access_admin($1::jsonb) AS r', [JSON.stringify(p)]);
    const r = rows[0].r as { username: string; email?: string | null };
    let emailed_to: string | null = null;
    let email_error: string | null = null;
    if (link && r.email) {
      const who = await pool.query('SELECT display_name FROM abix.console_users WHERE username = $1', [r.username]);
      const mail = invitationEmail(who.rows[0]?.display_name ?? r.username, r.username, link);
      try {
        await pool.query('SELECT abix.fn_mail_queue($1::jsonb)', [
          JSON.stringify({ to_email: r.email, to_name: who.rows[0]?.display_name, subject: mail.subject,
                           body: mail.body, purpose: 'invitation', about_user: r.username, created_by: actor }),
        ]);
        emailed_to = r.email;
      } catch (e) {
        email_error = friendly((e as Error).message);
      }
    } else if (link) {
      email_error = 'This account has no email address, so the link was not sent. Add one, or pass the link on yourself.';
    }
    return NextResponse.json({ ...r, invitation_link: link, emailed_to, email_error });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: friendly(msg) }, { status: msg.startsWith('FORBIDDEN:') ? 403 : 400 });
  }
}
