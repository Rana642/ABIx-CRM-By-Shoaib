import { NextRequest, NextResponse } from 'next/server';
import { MIN_PASSWORD_LENGTH, setPassword, verifyLogin } from '@/lib/logins';

export const dynamic = 'force-dynamic';

// The signed-in person's own account: who they are, and changing their password.

// Set by middleware.ts after the password check, so the browser cannot choose it.
function actorOf(req: NextRequest): string {
  return req.headers.get('x-console-user') ?? '';
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ user: actorOf(req), minLength: MIN_PASSWORD_LENGTH });
}

export async function POST(req: NextRequest) {
  const user = actorOf(req);
  if (!user) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const { current, next } = await req.json().catch(() => ({}));
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
