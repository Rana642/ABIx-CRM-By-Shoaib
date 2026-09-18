import { NextRequest, NextResponse } from 'next/server';
import { actorOf, me } from '@/lib/access';

export const dynamic = 'force-dynamic';

// The signed-in person and what they may do, per workspace (Users & Access). The screen uses it to
// show only what is allowed; every API route and the database still check on their own.
export async function GET(req: NextRequest) {
  const m = await me(actorOf(req));
  if (!m) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  return NextResponse.json(m, { headers: { 'Cache-Control': 'no-store' } });
}
