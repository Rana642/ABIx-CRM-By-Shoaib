import { NextRequest, NextResponse } from 'next/server';
import { verifyLogin } from '@/lib/logins';

export const dynamic = 'force-dynamic';

// Called by middleware.ts, which runs where the database cannot be reached, to check a console
// login. It answers only whether a name and password match — exactly what the sign-in prompt
// itself reveals — so it needs no login of its own.
export async function POST(req: NextRequest) {
  const { name, password } = await req.json().catch(() => ({}));
  const ok = typeof name === 'string' && typeof password === 'string' && (await verifyLogin(name, password));
  return NextResponse.json({ ok }, { headers: { 'Cache-Control': 'no-store' } });
}
