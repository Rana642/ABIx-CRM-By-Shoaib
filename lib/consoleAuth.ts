// Console logins, shared by the middleware and the connector sign-in page.
//
// CONSOLE_USERS holds "name:sha256(password)" pairs, comma-separated, so the
// server never stores a password in the clear. Uses Web Crypto only, so it runs
// both in the middleware (edge) and in route handlers (Node).

export function consoleUsers(): Map<string, string> {
  return new Map(
    (process.env.CONSOLE_USERS ?? '')
      .split(',')
      .map((pair) => pair.trim().split(':'))
      .filter((p) => p.length === 2 && p[0] && p[1])
      .map(([name, hash]) => [name, hash.toLowerCase()] as [string, string])
  );
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function checkConsolePassword(name: string, password: string): Promise<boolean> {
  const expected = consoleUsers().get(name);
  return !!expected && (await sha256Hex(password)) === expected;
}
