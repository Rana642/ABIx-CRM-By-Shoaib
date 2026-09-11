import { NextResponse, type NextRequest } from 'next/server';

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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(req: NextRequest) {
  const users = new Map(
    (process.env.CONSOLE_USERS ?? '')
      .split(',')
      .map((pair) => pair.trim().split(':'))
      .filter((p) => p.length === 2 && p[0] && p[1])
      .map(([name, hash]) => [name, hash.toLowerCase()] as const)
  );
  if (users.size === 0) {
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
      const expected = users.get(name);
      if (expected && (await sha256Hex(decoded.slice(sep + 1))) === expected) {
        return NextResponse.next();
      }
    }
  }
  return new NextResponse('Authentication required', CHALLENGE);
}
