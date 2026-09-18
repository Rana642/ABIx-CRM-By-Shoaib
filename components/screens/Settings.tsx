'use client';

import { useEffect, useState } from 'react';
import { Icon } from '../Shell';
import { Card, ComingSoon } from '../ui';

// Settings: the signed-in person's account (change password), then the configuration Aya
// still needs per business.
export function Settings() {
  const [user, setUser] = useState('');
  const [minLength, setMinLength] = useState(12);
  const [mfa, setMfa] = useState<{ mfa_enabled: boolean; mfa_required: boolean } | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/account')
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user ?? '');
        setMinLength(d.minLength ?? 12);
        setMfa(d.mfa ?? null);
      });
  }, []);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (next !== repeat) {
      setMessage({ ok: false, text: 'The two new passwords are not the same.' });
      return;
    }
    setBusy(true);
    const r = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, next }),
    });
    const d = await r.json().catch(() => ({ error: `The console answered ${r.status}.` }));
    setBusy(false);
    if (d.error) {
      setMessage({ ok: false, text: d.error });
      return;
    }
    setCurrent('');
    setNext('');
    setRepeat('');
    setMessage({
      ok: true,
      text: 'Password changed. Use the new password next time you sign in.',
    });
  }

  const input =
    'w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg px-space-12 py-space-8 border border-outline-variant';

  return (
    <div className="flex flex-col w-full gap-space-24">
      <Card className="flex flex-col gap-space-16 max-w-[560px]">
        <div className="flex items-center gap-space-8">
          <Icon name="account_circle" className="text-primary text-[22px]" />
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm text-on-surface">Your account</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Signed in as <b className="text-on-surface">{user || '…'}</b>
            </span>
          </div>
        </div>
        <form onSubmit={change} className="flex flex-col gap-space-12">
          <div className="flex flex-col gap-space-4">
            <label htmlFor="pw-current" className="font-label-md text-label-md text-on-surface-variant">Current password</label>
            <input id="pw-current" type="password" autoComplete="current-password" value={current}
                   onChange={(e) => setCurrent(e.target.value)} className={input} required />
          </div>
          <div className="flex flex-col gap-space-4">
            <label htmlFor="pw-new" className="font-label-md text-label-md text-on-surface-variant">
              New password <span className="font-normal text-outline">(at least {minLength} characters)</span>
            </label>
            <input id="pw-new" type="password" autoComplete="new-password" value={next} minLength={minLength}
                   onChange={(e) => setNext(e.target.value)} className={input} required />
          </div>
          <div className="flex flex-col gap-space-4">
            <label htmlFor="pw-repeat" className="font-label-md text-label-md text-on-surface-variant">New password again</label>
            <input id="pw-repeat" type="password" autoComplete="new-password" value={repeat}
                   onChange={(e) => setRepeat(e.target.value)} className={input} required />
          </div>
          {message && (
            <div role="status" className={`rounded-lg px-space-12 py-space-8 font-body-sm text-body-sm ${
              message.ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'}`}>
              {message.text}
            </div>
          )}
          <button type="submit" disabled={busy}
                  className="self-start px-space-16 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50">
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </form>
      </Card>

      <Card className="flex flex-col gap-space-12 max-w-[560px]">
        <div className="flex items-center gap-space-8">
          <Icon name="verified_user" className="text-primary text-[22px]" />
          <span className="font-headline-sm text-headline-sm text-on-surface">Two-step sign-in</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {mfa?.mfa_enabled
            ? 'On. Each sign-in asks for the six-digit code from your authenticator app.'
            : mfa?.mfa_required
              ? 'Required: you set it up at your next sign-in.'
              : 'Off. Turn it on to be asked for a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) at each sign-in.'}
        </p>
        {mfa && !mfa.mfa_enabled && !mfa.mfa_required && (
          <button
            type="button"
            className="self-start px-space-16 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary hover:opacity-90"
            onClick={async () => {
              if (!confirm('Turn on two-step sign-in? You will sign out now and set it up when you sign in again.')) return;
              await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'require_mfa' }) });
              window.location.href = '/api/auth/logout';
            }}
          >
            Turn on and set up now
          </button>
        )}
      </Card>

      <ComingSoon
        icon="settings"
        title="Business settings"
        what="Approvers, thresholds, reporting cadence, retention periods and kill switches."
        blockedBy={[
          'These are the configuration decisions your Operating Pack deliberately leaves open — they need your input per business',
        ]}
      />
    </div>
  );
}
