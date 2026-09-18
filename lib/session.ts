import { createHash, randomBytes } from 'crypto';
import { pool } from './db';

// Console sessions (44_ACCESS.sql). The browser holds a random token in an HttpOnly cookie; the
// database holds only its hash. Suspending or revoking a person ends their sessions at once.

export const SESSION_COOKIE = 'aya_session';
const SESSION_HOURS = 12;

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function createSession(username: string, ip: string | null, userAgent: string | null) {
  const token = newToken();
  await pool.query(
    `INSERT INTO abix.console_sessions (token_hash, username, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [hashToken(token), username, SESSION_HOURS, ip, (userAgent ?? '').slice(0, 300)]
  );
  await pool.query('UPDATE abix.console_users SET last_login_at = now() WHERE username = $1', [username]);
  return token;
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`;
}

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function tokenFromCookie(cookieHeader: string | null): string | null {
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookieHeader ?? '');
  return m ? m[1] : null;
}

export async function sessionUser(token: string | null): Promise<{ username: string; display_name: string } | null> {
  if (!token) return null;
  const { rows } = await pool.query('SELECT abix.fn_session_user($1) AS s', [hashToken(token)]);
  return rows[0]?.s ?? null;
}

export async function endSession(token: string | null) {
  if (!token) return;
  await pool.query('UPDATE abix.console_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
    hashToken(token),
  ]);
}
