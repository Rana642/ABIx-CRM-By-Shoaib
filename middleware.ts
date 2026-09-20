import { NextResponse, type NextRequest } from 'next/server';

// Sign-in for the console, enforced by the app itself (Users & Access, 44_ACCESS.sql).
//
// A session cookie, issued by /login after the password and, where set up, the two-step code. The
// middleware cannot reach the database, so it asks the app's own /api/auth/session who the cookie
// belongs to, and passes that on to the API as x-console-user — never taken from the browser. Every
// request asks again, so a session that was ended, or whose person was suspended or revoked, stops
// working on the very next request (Serge, 19 Sept: no window at all, not even a few seconds). What
// each person may do is checked by the API and the database on each request, not here.
//
// /webhook/ is not served by this app (the web server sends it to n8n), so Meta is unaffected.

export const config = {
  // Everything the app serves except its static build assets and the icon.
  matcher: ['/((?!_next/static|_next/image|icon.svg).*)'],
};

// Pages and endpoints that carry their own authentication or come before signing in.
const OPEN_EXACT = ['/login', '/invite', '/mcp', '/api/mcp', '/api/auth/session', '/api/auth/logout'];
const OPEN_PREFIXES = ['/.well-known/oauth-', '/.well-known/openid-configuration', '/oauth/', '/api/oauth/'];

const SESSION_URL = `http://127.0.0.1:${process.env.PORT || 3300}/api/auth/session`;

async function sessionUser(token: string): Promise<string | null> {
  try {
    const r = await fetch(SESSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });
    const d = r.ok ? await r.json() : null;
    if (d?.ok && typeof d.username === 'string') return d.username;
  } catch {
    // Unreachable: treat as signed out rather than let anyone in.
  }
  return null;
}

export async function middleware(req: NextRequest) {
  // Who is signed in is only ever set here, never taken from the browser.
  const headers = new Headers(req.headers);
  headers.delete('x-console-user');

  const path = req.nextUrl.pathname;
  if (OPEN_EXACT.includes(path) || OPEN_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next({ request: { headers } });
  }

  const token = req.cookies.get('aya_session')?.value;
  const user = token ? await sessionUser(token) : null;
  if (user) {
    headers.set('x-console-user', user);
    return NextResponse.next({ request: { headers } });
  }
  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  }
  // Behind the web server the request URL is the internal address: use the public host instead.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'ai.sergeabi.com';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('127.0.0.1') || host.startsWith('localhost') ? 'http' : 'https');
  const login = new URL(`${proto}://${host}/login`);
  login.searchParams.set('next', path + req.nextUrl.search);
  return NextResponse.redirect(login, 303);
}
