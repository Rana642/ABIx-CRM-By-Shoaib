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
    `SELECT l.id, l.pipeline_stage, l.estimated_value, l.source, l.created_at, l.updated_at,
            c.id AS contact_id, c.name AS contact_name, c.phone, c.email,
            c.lead_temperature, c.priority, c.location
     FROM public.leads l
     JOIN public.contacts c ON c.id = l.contact_id
     WHERE l.company_id = $1
     ORDER BY l.updated_at DESC`,
    [companyId]
  );
  return NextResponse.json(rows);
}

async function patchHandler(req: NextRequest) {
  const body = await req.json();
  const { id, pipeline_stage } = body;
  if (!id || !pipeline_stage) {
    return NextResponse.json({ error: 'id and pipeline_stage are required' }, { status: 400 });
  }
  const { rows } = await pool.query(
    `UPDATE public.leads SET pipeline_stage = $1, updated_at = now() WHERE id = $2 RETURNING id, pipeline_stage`,
    [pipeline_stage, id]
  );
  return NextResponse.json(rows[0] ?? {});
}

// Only for a workspace the person may see (Users & Access).
export const GET = guarded(async (req: NextRequest) => {
  await requireAccess(actorOf(req), 'workspace.view', req.nextUrl.searchParams.get('company_id'), 'leads');
  return getHandler(req);
});

export const PATCH = guarded(async (req: NextRequest) => {
  const { id } = await req.clone().json().catch(() => ({}));
  const lead = await pool.query('SELECT company_id FROM public.leads WHERE id = $1', [id]);
  await requireAccess(actorOf(req), 'crm.edit', lead.rows[0]?.company_id ?? null, 'change a lead');
  return patchHandler(req);
});
