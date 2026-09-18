import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { verifyLogin } from '@/lib/logins';
import { authPage, clientIp, errorBox, esc, safeNext } from '@/lib/authPages';
import { completeSignIn, finishSecondStep, secondStep } from '@/lib/signin';

export const dynamic = 'force-dynamic';

// The console's sign-in page (Users & Access). A correct password leads to the two-step code when
// the account has it, or to setting it up when it is required; then a session cookie.

function form(next: string, error?: string, username = '') {
  return authPage('Sign in to Aya', `
  <h1>Sign in</h1>
  ${errorBox(error)}
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="username">User name</label>
    <input id="username" name="username" autocomplete="username" value="${esc(username)}" required autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button>
  </form>`, error ? 401 : 200);
}

export async function GET(req: NextRequest) {
  return form(safeNext(req.nextUrl.searchParams.get('next')));
}

export async function POST(req: NextRequest) {
  const data = await req.formData();
  const challenge = String(data.get('challenge') ?? '');
  if (challenge) return finishSecondStep(challenge, String(data.get('code') ?? ''), req);

  const username = String(data.get('username') ?? '').trim().toLowerCase();
  const password = String(data.get('password') ?? '');
  const next = safeNext(String(data.get('next') ?? '/'));
  if (!(await verifyLogin(username, password))) {
    await pool
      .query('SELECT abix.fn_access_log($1, $2, $1, NULL, NULL, $3, $4::jsonb)', [
        username || 'unknown', 'login', 'denied', JSON.stringify({ ip: clientIp(req) }),
      ])
      .catch(() => undefined);
    // A pause on every failure keeps guessing slow.
    await new Promise((r) => setTimeout(r, 800));
    return form(next, 'That user name and password did not match, or the account cannot sign in.', username);
  }
  return (await secondStep(username, next)) ?? completeSignIn(username, next, req);
}
