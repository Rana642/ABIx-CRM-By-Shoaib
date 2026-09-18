import { NextRequest } from 'next/server';
import { clearSessionCookie, endSession, tokenFromCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Signing out ends the session in the database, not just in this browser.
async function logout(req: NextRequest) {
  await endSession(tokenFromCookie(req.headers.get('cookie')));
  return new Response(null, { status: 303, headers: { Location: '/login', 'Set-Cookie': clearSessionCookie() } });
}

export const POST = logout;
export const GET = logout;
