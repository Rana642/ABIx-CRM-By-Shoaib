'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Shell';
import { Card } from '../ui';

// Users & Access (Serge, 18 Sept 2026): invite people, give them a role on a workspace, review
// access, suspend or revoke. The database enforces every rule (abix.fn_access_admin); this screen
// only asks. New people have no workspace until one is assigned here.

type User = {
  username: string; display_name: string; email: string | null; status: 'invited' | 'active' | 'suspended' | 'revoked';
  is_owner: boolean; can_manage_users: boolean; mfa_required: boolean; mfa_enabled: boolean;
  access_expires_at: string | null; invited_by: string | null; created_at: string; last_login_at: string | null;
};
type Assignment = {
  assignment_id: string; username: string; company_id: string | null; company: string | null; role_code: string;
  role: string; granted_by: string; granted_at: string; expires_at: string | null; expired: boolean; note: string | null;
};
type Grant = { grant_id: string; username: string; permission_code: string; company: string | null; granted_by: string; expires_at: string | null };
type Invitation = { username: string; email: string | null; invited_by: string; created_at: string; expires_at: string; expired: boolean; emailed_at: string | null };
type Role = { role_code: string; name: string; description: string };
type Company = { company_id: string; name: string; code: string };
type Audit = { at: string; actor: string | null; action: string; target: string | null; company: string | null; permission: string | null; outcome: string; detail: Record<string, unknown> };
type Data = { me: { username: string; is_owner: boolean }; users: User[]; assignments: Assignment[]; grants: Grant[];
  invitations: Invitation[]; roles: Role[]; companies: Company[]; audit: Audit[] };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_TONE: Record<string, string> = {
  active: 'bg-secondary-container text-on-secondary-container',
  invited: 'bg-primary-container/15 text-primary',
  suspended: 'bg-error-container text-on-error-container',
  revoked: 'bg-surface-container-high text-on-surface-variant',
};

const input = 'bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded-lg px-space-8 py-space-8 border border-outline-variant';
const btn = 'px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold disabled:opacity-50';
const primary = `${btn} bg-primary-container text-on-primary hover:opacity-90`;
const quiet = `${btn} border border-outline-variant text-on-surface hover:bg-surface-container-high`;
const danger = `${btn} border border-error text-error hover:bg-error-container`;

export function Users() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ username: string; url: string; emailed_to: string | null; email_error: string | null } | null>(null);
  const [invite, setInvite] = useState({ username: '', display_name: '', email: '', mfa_required: true, access_expires_at: '' });
  const [assign, setAssign] = useState<{ username: string; company_id: string; role: string; expires_at: string }>({
    username: '', company_id: '', role: 'viewer', expires_at: '',
  });

  const load = useCallback(async () => {
    const r = await fetch('/api/users');
    const d = await r.json();
    if (!r.ok) setError(d.error ?? 'Users & Access could not be loaded.');
    else setData(d);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError('');
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({ error: `The console answered ${r.status}.` }));
    setBusy(false);
    if (d.error) {
      setError(d.error);
      return null;
    }
    if (d.invitation_link) {
      setLink({ username: String(body.username), url: d.invitation_link, emailed_to: d.emailed_to ?? null, email_error: d.email_error ?? null });
    }
    await load();
    return d;
  }

  if (!data) {
    return <Card>{error ? <p className="text-error font-body-md text-body-md">{error}</p> : <p className="font-body-md text-body-md">Loading…</p>}</Card>;
  }

  const byUser = (u: string) => data.assignments.filter((a) => a.username === u);
  const grantsOf = (u: string) => data.grants.filter((g) => g.username === u);
  const pendingInvite = (u: string) => data.invitations.find((i) => i.username === u);

  return (
    <div className="flex flex-col w-full gap-space-24">
      <Card className="flex flex-col gap-space-8">
        <div className="flex items-center gap-space-8">
          <Icon name="manage_accounts" className="text-primary text-[22px]" />
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Users &amp; Access</h2>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[80ch]">
          Each person has their own account and a role on each workspace they may use: <b>Viewer</b> reads,
          <b> Operator</b> also handles conversations and customer records, <b>Workspace Administrator</b> also pauses
          that workspace’s agents. Only the Owner grants access to all businesses, sensitive data or exports, or lets
          someone else manage people. Every change and every refused action is recorded below.
        </p>
      </Card>

      {error && (
        <div role="alert" className="flex items-start gap-space-8 bg-error-container text-on-error-container rounded-lg px-space-12 py-space-8 font-body-sm text-body-sm">
          <Icon name="error" className="text-[18px]" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss" className="font-semibold">×</button>
        </div>
      )}

      {link && (
        <Card className="flex flex-col gap-space-8 border border-primary">
          <span className="font-headline-sm text-headline-sm text-on-surface">Invitation link for {link.username}</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {link.emailed_to
              ? `Sent by email to ${link.emailed_to}. The same link is here in case you want to pass it on yourself.`
              : 'Send it to them yourself (WhatsApp or email).'}{' '}
            It is shown only now, works once and expires in 72 hours. They choose their own password and, if required,
            set up two-step sign-in.
          </span>
          {link.email_error && (
            <span className="font-body-sm text-body-sm text-error">{link.email_error}</span>
          )}
          <code className="font-body-sm text-body-sm bg-surface-container-low rounded-lg px-space-8 py-space-8 break-all">{link.url}</code>
          <div className="flex gap-space-8">
            <button type="button" className={primary} onClick={() => navigator.clipboard?.writeText(link.url)}>Copy link</button>
            <button type="button" className={quiet} onClick={() => setLink(null)}>Done</button>
          </div>
        </Card>
      )}

      {/* Invite */}
      <Card className="flex flex-col gap-space-12">
        <span className="font-headline-sm text-headline-sm text-on-surface">Invite someone</span>
        <form
          className="grid grid-cols-1 md:grid-cols-2 gap-space-8"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await act({
              action: 'invite', username: invite.username, display_name: invite.display_name, email: invite.email,
              mfa_required: invite.mfa_required, access_expires_at: invite.access_expires_at || null,
            });
            if (d) setInvite({ username: '', display_name: '', email: '', mfa_required: true, access_expires_at: '' });
          }}
        >
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="inv-user">
            User name <input id="inv-user" className={input} value={invite.username} required
              onChange={(e) => setInvite({ ...invite, username: e.target.value.toLowerCase() })} placeholder="e.g. zainah" />
          </label>
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="inv-name">
            Name shown <input id="inv-name" className={input} value={invite.display_name}
              onChange={(e) => setInvite({ ...invite, display_name: e.target.value })} placeholder="Full name" />
          </label>
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="inv-email">
            Email (optional) <input id="inv-email" type="email" className={input} value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          </label>
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="inv-exp">
            Account expires (optional, for temporary access) <input id="inv-exp" type="date" className={input}
              value={invite.access_expires_at} onChange={(e) => setInvite({ ...invite, access_expires_at: e.target.value })} />
          </label>
          <label className="flex items-center gap-space-8 font-body-sm text-body-sm text-on-surface md:col-span-2" htmlFor="inv-mfa">
            <input id="inv-mfa" type="checkbox" checked={invite.mfa_required}
              onChange={(e) => setInvite({ ...invite, mfa_required: e.target.checked })} />
            Require two-step sign-in (recommended)
          </label>
          <div className="md:col-span-2 flex items-center gap-space-8">
            <button type="submit" className={primary} disabled={busy}>Create invitation</button>
            <span className="font-body-sm text-body-sm text-outline">The new account gets no workspace until you assign one below.</span>
          </div>
        </form>
      </Card>

      {/* Assign */}
      <Card className="flex flex-col gap-space-12">
        <span className="font-headline-sm text-headline-sm text-on-surface">Give someone a role on a workspace</span>
        <form
          className="flex flex-wrap items-end gap-space-8"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: 'assign', username: assign.username, company_id: assign.company_id || null,
                  role: assign.role, expires_at: assign.expires_at || null });
          }}
        >
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="as-user">
            Person
            <select id="as-user" className={input} value={assign.username} required
              onChange={(e) => setAssign({ ...assign, username: e.target.value })}>
              <option value="">Choose…</option>
              {data.users.filter((u) => !u.is_owner && u.status !== 'revoked').map((u) => (
                <option key={u.username} value={u.username}>{u.display_name} ({u.username})</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="as-ws">
            Workspace
            <select id="as-ws" className={input} value={assign.company_id} required={!data.me.is_owner}
              onChange={(e) => setAssign({ ...assign, company_id: e.target.value })}>
              <option value="">{data.me.is_owner ? 'All businesses (portfolio-wide)' : 'Choose…'}</option>
              {data.companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="as-role">
            Role
            <select id="as-role" className={input} value={assign.role} onChange={(e) => setAssign({ ...assign, role: e.target.value })}>
              {data.roles.map((r) => <option key={r.role_code} value={r.role_code}>{r.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-space-4 font-label-md text-label-md text-on-surface-variant" htmlFor="as-exp">
            Until (optional)
            <input id="as-exp" type="date" className={input} value={assign.expires_at}
              onChange={(e) => setAssign({ ...assign, expires_at: e.target.value })} />
          </label>
          <button type="submit" className={primary} disabled={busy}>Assign</button>
        </form>
        <span className="font-body-sm text-body-sm text-outline">
          {data.roles.map((r) => `${r.name}: ${r.description}`).join(' ')}
        </span>
      </Card>

      {/* People */}
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[860px] font-body-sm text-body-sm">
          <thead>
            <tr className="text-left text-outline font-label-sm text-label-sm uppercase">
              <th className="px-space-16 py-space-12">Person</th>
              <th className="px-space-12 py-space-12">Status</th>
              <th className="px-space-12 py-space-12">Access</th>
              <th className="px-space-12 py-space-12">Sign-in</th>
              <th className="px-space-12 py-space-12">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const inv = pendingInvite(u.username);
              return (
                <tr key={u.username} className="border-t border-surface-container align-top">
                  <td className="px-space-16 py-space-12">
                    <div className="font-semibold text-on-surface">{u.display_name}</div>
                    <div className="text-outline">
                      {u.username}{u.email && u.email !== u.username ? ` · ${u.email}` : ''}
                      {!u.is_owner && (
                        <button
                          type="button"
                          className="ml-space-8 text-primary font-semibold"
                          disabled={busy}
                          onClick={() => {
                            const email = prompt(`Email address for ${u.display_name}, where invitations are sent:`, u.email ?? '');
                            if (email !== null) act({ action: 'set_email', username: u.username, email: email.trim() });
                          }}
                        >
                          {u.email ? 'Change email' : 'Add email'}
                        </button>
                      )}
                    </div>
                    {u.access_expires_at && <div className="text-outline">Account until {when(u.access_expires_at)}</div>}
                  </td>
                  <td className="px-space-12 py-space-12">
                    <span className={`px-space-8 py-0.5 rounded-full font-label-sm text-label-sm ${STATUS_TONE[u.status]}`}>{u.status}</span>
                    {inv && (
                      <div className="text-outline mt-space-4">
                        {inv.expired ? 'Invitation expired' : `Invited, until ${when(inv.expires_at)}`}
                        <div>{inv.emailed_at ? `Emailed to ${inv.email} on ${when(inv.emailed_at)}` : 'Not emailed — pass the link on yourself'}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-space-12 py-space-12">
                    {u.is_owner ? (
                      <span className="text-on-surface">Owner · everything</span>
                    ) : (
                      <ul className="flex flex-col gap-space-4">
                        {byUser(u.username).length === 0 && <li className="text-outline">No workspace</li>}
                        {byUser(u.username).map((a) => (
                          <li key={a.assignment_id} className="flex items-center gap-space-8">
                            <span className={a.expired ? 'line-through text-outline' : 'text-on-surface'}>
                              {a.role} · {a.company ?? 'All businesses'}{a.expires_at ? ` · until ${when(a.expires_at)}` : ''}
                            </span>
                            <button type="button" className="text-error font-semibold" disabled={busy}
                              onClick={() => act({ action: 'unassign', assignment_id: a.assignment_id, username: u.username },
                                `Remove ${a.role} on ${a.company ?? 'all businesses'} from ${u.display_name}? Their open sessions end now.`)}>
                              Remove
                            </button>
                          </li>
                        ))}
                        {grantsOf(u.username).map((g) => (
                          <li key={g.grant_id} className="flex items-center gap-space-8">
                            <span className="text-on-surface">{g.permission_code === 'sensitive.view' ? 'Sensitive data' : 'Bulk export'} · {g.company ?? 'all businesses'}</span>
                            {data.me.is_owner && (
                              <button type="button" className="text-error font-semibold" disabled={busy}
                                onClick={() => act({ action: 'ungrant', grant_id: g.grant_id, username: u.username })}>Remove</button>
                            )}
                          </li>
                        ))}
                        {u.can_manage_users && <li className="text-on-surface">Manages people (delegated)</li>}
                      </ul>
                    )}
                  </td>
                  <td className="px-space-12 py-space-12 text-on-surface-variant">
                    <div>Two-step: {u.mfa_enabled ? 'on' : u.mfa_required ? 'required, not set up yet' : 'off'}</div>
                    <div>Last sign-in: {when(u.last_login_at)}</div>
                  </td>
                  <td className="px-space-12 py-space-12">
                    {!u.is_owner && u.username !== data.me.username && (
                      <div className="flex flex-wrap gap-space-4">
                        {u.status === 'active' && (
                          <button type="button" className={danger} disabled={busy}
                            onClick={() => act({ action: 'suspend', username: u.username }, `Suspend ${u.display_name}? Their sessions and connector access end now.`)}>
                            Suspend
                          </button>
                        )}
                        {u.status === 'suspended' && (
                          <button type="button" className={quiet} disabled={busy} onClick={() => act({ action: 'reactivate', username: u.username })}>Reactivate</button>
                        )}
                        {u.status !== 'revoked' && (
                          <button type="button" className={quiet} disabled={busy}
                            onClick={() => act({ action: 'reinvite', username: u.username },
                              `Send ${u.display_name} a new invitation? It is emailed to them if their account has an email address, and it is how a forgotten password is reset. Their current password and sessions stop working.`)}>
                            New invitation or password reset
                          </button>
                        )}
                        {u.status !== 'revoked' && u.mfa_enabled && (
                          <button type="button" className={quiet} disabled={busy}
                            onClick={() => act({ action: 'reset_mfa', username: u.username }, `Reset ${u.display_name}'s two-step sign-in? They set it up again at their next sign-in.`)}>
                            Reset two-step
                          </button>
                        )}
                        {u.status !== 'revoked' && !u.mfa_required && (
                          <button type="button" className={quiet} disabled={busy}
                            onClick={() => act({ action: 'set_mfa_required', username: u.username, value: true })}>Require two-step</button>
                        )}
                        {data.me.is_owner && u.status !== 'revoked' && (
                          <>
                            <button type="button" className={quiet} disabled={busy}
                              onClick={() => act({ action: 'set_delegate', username: u.username, value: !u.can_manage_users },
                                u.can_manage_users ? `Stop ${u.display_name} managing people?` : `Let ${u.display_name} invite people and assign workspaces (not all businesses, sensitive data or exports)?`)}>
                              {u.can_manage_users ? 'Stop managing people' : 'Let manage people'}
                            </button>
                            <button type="button" className={quiet} disabled={busy}
                              onClick={() => {
                                const ws = data.companies.find((c) => c.code === 'CLIF') ?? data.companies[0];
                                act({ action: 'grant', username: u.username, permission: 'sensitive.view', company_id: ws?.company_id },
                                  `Allow ${u.display_name} to see sensitive data (identity documents, recordings, credentials) in ${ws?.name}?`);
                              }}>
                              Allow sensitive data
                            </button>
                          </>
                        )}
                        {u.status !== 'revoked' && (
                          <button type="button" className={danger} disabled={busy}
                            onClick={() => act({ action: 'revoke', username: u.username },
                              `Revoke ${u.display_name}? Their password, roles and sessions are removed at once. You can bring the account back later with Restore, which sends a fresh invitation.`)}>
                            Revoke
                          </button>
                        )}
                        {u.status === 'revoked' && (
                          <button type="button" className={quiet} disabled={busy}
                            onClick={() => act({ action: 'restore', username: u.username },
                              `Restore ${u.display_name}? They receive a new invitation and choose a new password and two-step code. Their previous workspaces stay removed, so assign them again.`)}>
                            Restore
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Audit */}
      <Card padded={false} className="overflow-x-auto">
        <div className="px-space-16 py-space-12 font-headline-sm text-headline-sm text-on-surface">Access log</div>
        <table className="w-full min-w-[760px] font-body-sm text-body-sm">
          <thead>
            <tr className="text-left text-outline font-label-sm text-label-sm uppercase">
              <th className="px-space-16 py-space-8">When</th><th className="px-space-12 py-space-8">Who</th>
              <th className="px-space-12 py-space-8">What</th><th className="px-space-12 py-space-8">About</th>
              <th className="px-space-12 py-space-8">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.audit.map((a, i) => (
              <tr key={i} className="border-t border-surface-container">
                <td className="px-space-16 py-space-8 whitespace-nowrap text-on-surface-variant">{when(a.at)}</td>
                <td className="px-space-12 py-space-8 text-on-surface">{a.actor ?? '—'}</td>
                <td className="px-space-12 py-space-8 text-on-surface">{a.action}{a.permission ? ` (${a.permission})` : ''}</td>
                <td className="px-space-12 py-space-8 text-on-surface-variant">{[a.target, a.company].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-space-12 py-space-8">
                  <span className={a.outcome === 'denied' ? 'text-error font-semibold' : 'text-on-surface-variant'}>
                    {a.outcome === 'denied' ? 'Refused' : 'Done'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
