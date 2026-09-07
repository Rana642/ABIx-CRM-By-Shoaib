import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }
  const { rows } = await pool.query(
    `SELECT l.id, l.pipeline_stage, l.estimated_value, l.source, l.created_at, l.updated_at,
            c.id AS contact_id, c.name AS contact_name, c.phone, c.email,
            c.lead_temperature, c.priority, c.location
     FROM leads l
     JOIN contacts c ON c.id = l.contact_id
     WHERE l.company_id = $1
     ORDER BY l.updated_at DESC`,
    [companyId]
  );
  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, pipeline_stage } = body;
  if (!id || !pipeline_stage) {
    return NextResponse.json({ error: 'id and pipeline_stage are required' }, { status: 400 });
  }
  const { rows } = await pool.query(
    `UPDATE leads SET pipeline_stage = $1, updated_at = now() WHERE id = $2 RETURNING id, pipeline_stage`,
    [pipeline_stage, id]
  );
  return NextResponse.json(rows[0] ?? {});
}
