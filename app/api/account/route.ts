import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { MIN_PASSWORD_LENGTH, setPassword, verifyLogin } from '@/lib/logins';

export const dynamic = 'force-dynamic';

// The signed-in person's own account: who they are, and changing their password.

// Set by middleware.ts after the password check, so the browser cannot choose it.
function actorOf(req: NextRequest): string {
  return req.headers.get('x-console-user') ?? '';
}

export async function GET(req: NextRequest) {
  const u = await pool.query('SELECT mfa_enabled, mfa_required FROM abix.console_users WHERE username = $1', [actorOf(req)]);
  return NextResponse.json({ user: actorOf(req), minLength: MIN_PASSWORD_LENGTH, mfa: u.rows[0] ?? null });
}

export async function POST(req: NextRequest) {
  const user = actorOf(req);
  if (!user) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  // Turning on two-step sign-in for oneself: required from now on, set up at the next sign-in.
  if (body.action === 'require_mfa') {
    await pool.query('UPDATE abix.console_users SET mfa_required = true WHERE username = $1', [user]);
    await pool.query("SELECT abix.fn_access_log($1, 'mfa.required_by_self', $1, NULL, NULL, 'done', '{}'::jsonb)", [user]);
    return NextResponse.json({ ok: true });
  }
  const { current, next } = body;
  if (typeof current !== 'string' || typeof next !== 'string') {
    return NextResponse.json({ error: 'Fill in both passwords.' }, { status: 400 });
  }
  if (!(await verifyLogin(user, current))) {
    return NextResponse.json({ error: 'Your current password is not correct.' }, { status: 400 });
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.` },
      { status: 400 }
    );
  }
  if (next === current) {
    return NextResponse.json({ error: 'The new password is the same as the current one.' }, { status: 400 });
  }
  await setPassword(user, next, user);
  return NextResponse.json({ ok: true });
}
