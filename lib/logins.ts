import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { pool } from './db';
import { consoleUsers } from './consoleAuth';

// Console logins, checked on the server (Node). A password someone changed in the console lives
// in abix.console_logins as PBKDF2 and overrides the CONSOLE_USERS setting for that user
// (41_CONSOLE_LOGINS.sql); everyone else still signs in with the password in that setting.

const ITERATIONS = 210_000;
export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function matchesPbkdf2(password: string, stored: string): boolean {
  const [kind, iterations, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = pbkdf2Sync(password, Buffer.from(salt, 'base64'), Number(iterations), expected.length, 'sha256');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyLogin(name: string, password: string): Promise<boolean> {
  if (!name || !password) return false;
  // Only an active account whose access has not expired may sign in (Users & Access, 44_ACCESS.sql).
  const active = await pool
    .query(
      `SELECT 1 FROM abix.console_users WHERE username = $1 AND status = 'active'
         AND (access_expires_at IS NULL OR access_expires_at > now())`,
      [name]
    )
    .then((r) => r.rowCount === 1)
    .catch(() => false);
  if (!active) return false;
  // If the database cannot answer, fall back to the server setting rather than lock everyone out.
  const rows = await pool
    .query('SELECT password_hash FROM abix.console_logins WHERE username = $1', [name])
    .then((r) => r.rows)
    .catch(() => []);
  if (rows[0]) return matchesPbkdf2(password, rows[0].password_hash);
  const expected = consoleUsers().get(name);
  if (!expected) return false;
  const actual = createHash('sha256').update(password).digest('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export async function setPassword(name: string, password: string, by: string): Promise<void> {
  await pool.query(
    `INSERT INTO abix.console_logins (username, password_hash, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash,
       updated_at = now(), updated_by = excluded.updated_by`,
    [name, hashPassword(password), by]
  );
}
