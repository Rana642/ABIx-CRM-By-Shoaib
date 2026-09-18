import QRCode from 'qrcode';
import { pool } from './db';
import { authPage, clientIp, errorBox, esc, safeNext } from './authPages';
import { createSession, hashToken, newToken, sessionCookie } from './session';
import { newTotpSecret, otpauthUri, verifyTotp } from './totp';

// After a correct password (or an accepted invitation): the two-step code, or setting up the
// authenticator app when two-step sign-in is required and not yet set up, then the session.

const CHALLENGE_MINUTES = 10;

type Challenge = { challenge_id: string; username: string; purpose: 'mfa' | 'mfa_enrol'; pending_secret: string | null; next_url: string | null };

export async function completeSignIn(username: string, next: string, req: Request) {
  const token = await createSession(username, clientIp(req), req.headers.get('user-agent'));
  await pool.query('SELECT abix.fn_access_log($1, $2, $1, NULL, NULL, $3, $4::jsonb)', [
    username, 'login', 'done', JSON.stringify({ ip: clientIp(req) }),
  ]);
  return new Response(null, { status: 303, headers: { Location: safeNext(next), 'Set-Cookie': sessionCookie(token) } });
}

// Returns the page for the second step, or null when none is needed.
export async function secondStep(username: string, next: string): Promise<Response | null> {
  const { rows } = await pool.query('SELECT mfa_enabled, mfa_required FROM abix.console_users WHERE username = $1', [username]);
  const u = rows[0];
  if (!u || (!u.mfa_enabled && !u.mfa_required)) return null;
  const token = newToken();
  const purpose = u.mfa_enabled ? 'mfa' : 'mfa_enrol';
  const secret = purpose === 'mfa_enrol' ? newTotpSecret() : null;
  await pool.query(
    `INSERT INTO abix.console_login_challenges (token_hash, username, purpose, pending_secret, next_url, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`,
    [hashToken(token), username, purpose, secret, safeNext(next), CHALLENGE_MINUTES]
  );
  return purpose === 'mfa' ? codePage(token) : enrolPage(token, username, secret!);
}

function codePage(token: string, error?: string) {
  return authPage('Two-step sign-in', `
  <h1>Enter your code</h1>
  <p>Open your authenticator app and type the six-digit code for the Aya console.</p>
  ${errorBox(error)}
  <form method="post" action="/login">
    <input type="hidden" name="challenge" value="${esc(token)}">
    <label for="code">Six-digit code</label>
    <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" required autofocus>
    <button type="submit">Sign in</button>
  </form>`, error ? 400 : 200);
}

async function enrolPage(token: string, username: string, secret: string, error?: string) {
  const qr = await QRCode.toDataURL(otpauthUri(username, secret), { margin: 1, width: 200 });
  return authPage('Set up two-step sign-in', `
  <h1>Set up two-step sign-in</h1>
  <p>Your account needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) each time you sign in.</p>
  <p>Scan this with the app, or enter the key by hand:</p>
  <img class="qr" src="${qr}" alt="QR code for your authenticator app">
  <p style="text-align:center"><code>${esc(secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
  ${errorBox(error)}
  <form method="post" action="/login">
    <input type="hidden" name="challenge" value="${esc(token)}">
    <label for="code">Then type the six-digit code it shows</label>
    <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" required autofocus>
    <button type="submit">Confirm and sign in</button>
  </form>`, error ? 400 : 200);
}

// Handles the posted code. Returns the response to send (a page again, or the signed-in redirect).
export async function finishSecondStep(token: string, code: string, req: Request): Promise<Response> {
  const { rows } = await pool.query<Challenge>(
    `SELECT challenge_id, username, purpose, pending_secret, next_url FROM abix.console_login_challenges
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(token)]
  );
  const c = rows[0];
  if (!c) return authPage('Sign in', `<h1>That step has expired</h1><p>Please <a href="/login">sign in again</a>.</p>`, 400);

  const user = await pool.query('SELECT status, mfa_secret FROM abix.console_users WHERE username = $1', [c.username]);
  if (user.rows[0]?.status !== 'active') {
    return authPage('Sign in', `<h1>This account cannot sign in</h1><p>Ask the person who manages access.</p>`, 403);
  }
  const secret = c.purpose === 'mfa' ? user.rows[0].mfa_secret : c.pending_secret;
  if (!secret || !verifyTotp(secret, code)) {
    await pool.query('SELECT abix.fn_access_log($1, $2, $1, NULL, NULL, $3, $4::jsonb)', [
      c.username, 'login.code', 'denied', JSON.stringify({ ip: clientIp(req) }),
    ]);
    await new Promise((r) => setTimeout(r, 800));
    return c.purpose === 'mfa'
      ? codePage(token, 'That code did not match. Try the current one.')
      : enrolPage(token, c.username, secret, 'That code did not match. Try the current one.');
  }
  await pool.query('UPDATE abix.console_login_challenges SET used_at = now() WHERE challenge_id = $1', [c.challenge_id]);
  if (c.purpose === 'mfa_enrol') {
    await pool.query('UPDATE abix.console_users SET mfa_secret = $2, mfa_enabled = true WHERE username = $1', [c.username, secret]);
    await pool.query('SELECT abix.fn_access_log($1, $2, $1, NULL, NULL, $3, $4::jsonb)', [c.username, 'mfa.enabled', 'done', '{}']);
  }
  return completeSignIn(c.username, c.next_url ?? '/', req);
}
