import { NextResponse, type NextRequest } from 'next/server';
import { checkConsolePassword, consoleUsers } from './lib/consoleAuth';

// Login for the console, enforced by the app itself.
//
// It used to sit on the web server, but a login there covers every path under
// the site — including /webhook/, which Meta must reach without one to deliver
// WhatsApp messages. Doing it here protects exactly the console and its API.
//
// CONSOLE_USERS holds "name:sha256(password)" pairs, comma-separated, so the
// server never stores a password in the clear. With no users configured the
// console refuses everyone rather than opening up.

export const config = {
  // Everything the app serves except its static build assets and the icon.
  matcher: ['/((?!_next/static|_next/image|icon.svg).*)'],
};

const CHALLENGE = {
  status: 401,
  headers: { 'WWW-Authenticate': 'Basic realm="Aya Console", charset="UTF-8"' },
};

// The MCP connector's endpoints carry their own authentication — the OAuth
// discovery documents, the sign-in form, the token exchange, and the MCP
// server's bearer tokens — so the console login does not apply to them.
const OWN_AUTH_EXACT = ['/mcp', '/api/mcp'];
const OWN_AUTH_PREFIXES = ['/.well-known/oauth-', '/.well-known/openid-configuration', '/oauth/', '/api/oauth/'];

export async function middleware(req: NextRequest) {
  // Who is signed in is only ever set here, never taken from the browser.
  const headers = new Headers(req.headers);
  headers.delete('x-console-user');

  const path = req.nextUrl.pathname;
  if (OWN_AUTH_EXACT.includes(path) || OWN_AUTH_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next({ request: { headers } });
  }

  if (consoleUsers().size === 0) {
    return new NextResponse('Console login is not configured.', { status: 503 });
  }

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = atob(header.slice(6));
    } catch {
      return new NextResponse('Authentication required', CHALLENGE);
    }
    const sep = decoded.indexOf(':');
    if (sep > 0) {
      const name = decoded.slice(0, sep);
      if (await checkConsolePassword(name, decoded.slice(sep + 1))) {
        // Tell the API who is signed in.
        headers.set('x-console-user', name);
        return NextResponse.next({ request: { headers } });
      }
    }
  }
  return new NextResponse('Authentication required', CHALLENGE);
}
