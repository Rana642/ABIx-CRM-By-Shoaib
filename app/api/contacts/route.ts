import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { actorOf, guarded, requireAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }
  const { rows } = await pool.query(
    `SELECT id, name, phone, email, relationship, status, lead_temperature,
            location, last_contact_at, next_action, follow_up_date, owner,
            priority, do_not_contact, created_at
     FROM public.contacts
     WHERE company_id = $1
     ORDER BY last_contact_at DESC NULLS LAST`,
    [companyId]
  );
  return NextResponse.json(rows);
}

// Only for a workspace the person may see (Users & Access).
export const GET = guarded(async (req: NextRequest) => {
  await requireAccess(actorOf(req), 'workspace.view', req.nextUrl.searchParams.get('company_id'), 'contacts');
  return getHandler(req);
});
