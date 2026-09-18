import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { authPage, errorBox, esc } from '@/lib/authPages';
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/logins';
import { hashToken } from '@/lib/session';
import { completeSignIn, secondStep } from '@/lib/signin';

export const dynamic = 'force-dynamic';

// Accepting an invitation (Users & Access): the invited person chooses their own password, sets up
// two-step sign-in when their account requires it, and is signed in. The invitation works once and
// expires; the account has no workspace until someone who manages access assigns one.

async function invitation(token: string) {
  const { rows } = await pool.query(
    `SELECT i.username, u.display_name, i.expires_at > now() AND i.accepted_at IS NULL AND i.revoked_at IS NULL
              AND u.status = 'invited' AS valid
       FROM abix.console_invitations i JOIN abix.console_users u USING (username)
      WHERE i.token_hash = $1`,
    [hashToken(token)]
  );
  return rows[0] as { username: string; display_name: string; valid: boolean } | undefined;
}

const invalid = () =>
  authPage('Invitation', `<h1>This invitation cannot be used</h1>
  <p>It has expired, was already used or was withdrawn. Ask the person who invited you for a new one.</p>`, 410);

function form(token: string, name: string, username: string, error?: string) {
  return authPage('Join the Aya console', `
  <h1>Welcome, ${esc(name)}</h1>
  <p>Choose your password for the Aya console. Your user name is <code>${esc(username)}</code>.</p>
  ${errorBox(error)}
  <form method="post" action="/invite">
    <input type="hidden" name="token" value="${esc(token)}">
    <label for="password">Password (at least ${MIN_PASSWORD_LENGTH} characters)</label>
    <input id="password" name="password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required autofocus>
    <label for="password2">The same password again</label>
    <input id="password2" name="password2" type="password" autocomplete="new-password" required>
    <button type="submit">Set password</button>
  </form>`, error ? 400 : 200);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const inv = token ? await invitation(token) : undefined;
  if (!inv?.valid) return invalid();
  return form(token, inv.display_name, inv.username);
}

export async function POST(req: NextRequest) {
  const data = await req.formData();
  const token = String(data.get('token') ?? '');
  const password = String(data.get('password') ?? '');
  const inv = token ? await invitation(token) : undefined;
  if (!inv?.valid) {
    // Still recorded as a refused invitation by the database function.
    await pool.query('SELECT abix.fn_access_accept_invitation($1, $2)', [hashToken(token), 'pbkdf2$0$x$x']).catch(() => undefined);
    return invalid();
  }
  if (password.length < MIN_PASSWORD_LENGTH) return form(token, inv.display_name, inv.username, `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password !== String(data.get('password2') ?? '')) return form(token, inv.display_name, inv.username, 'The two passwords are not the same.');
  try {
    await pool.query('SELECT abix.fn_access_accept_invitation($1, $2)', [hashToken(token), hashPassword(password)]);
  } catch {
    return invalid();
  }
  return (await secondStep(inv.username, '/')) ?? completeSignIn(inv.username, '/', req);
}
