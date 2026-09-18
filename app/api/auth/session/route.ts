import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Called by middleware.ts, which cannot reach the database, to learn who a session cookie belongs
// to. It answers only for the token it is given, so it needs no login of its own.
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  const s = typeof token === 'string' ? await sessionUser(token) : null;
  return NextResponse.json(s ? { ok: true, username: s.username } : { ok: false }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
