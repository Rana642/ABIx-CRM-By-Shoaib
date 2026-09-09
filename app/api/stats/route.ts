import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }

  const [contacts, leadsByStage, hotLeads, opportunities] = await Promise.all([
    pool.query(`SELECT count(*)::int AS n FROM public.contacts WHERE company_id = $1`, [companyId]),
    pool.query(
      `SELECT pipeline_stage, count(*)::int AS n, coalesce(sum(estimated_value),0)::float AS value
       FROM public.leads WHERE company_id = $1 GROUP BY pipeline_stage`,
      [companyId]
    ),
    pool.query(
      `SELECT count(*)::int AS n FROM public.contacts WHERE company_id = $1 AND lead_temperature = 'hot'`,
      [companyId]
    ),
    pool.query(
      `SELECT count(*)::int AS n, coalesce(sum(estimated_value),0)::float AS value
       FROM public.opportunities WHERE company_id = $1 AND status = 'open'`,
      [companyId]
    ),
  ]);

  return NextResponse.json({
    total_contacts: contacts.rows[0].n,
    hot_leads: hotLeads.rows[0].n,
    open_opportunities: opportunities.rows[0].n,
    open_opportunities_value: opportunities.rows[0].value,
    leads_by_stage: leadsByStage.rows,
  });
}
