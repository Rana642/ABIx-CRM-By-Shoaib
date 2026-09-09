import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The 20 Company Brain modules for one company, with the per-module score the
// readiness formula in 08_COMPANY_BRAIN_ONBOARDING.yaml actually uses.
export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }

  const [modules, summary] = await Promise.all([
    // v_module_scores applies the weighted formula from file 08. Reading the
    // score from the view rather than recomputing it keeps this screen and the
    // readiness rollup from ever disagreeing.
    pool.query(
      `SELECT s.module_code, s.module_name, s.status, s.readiness_weight,
              s.is_critical, s.module_score AS score,
              m.version, m.last_verified_at,
              m.metadata->>'gap_note' AS gap_note,
              k.title AS knowledge_title
       FROM abix.v_module_scores s
       JOIN abix.company_brain_modules m
              ON m.company_id = s.company_id
             AND m.module_code = s.module_code
       LEFT JOIN abix.knowledge_items k
              ON m.content_reference = 'knowledge://' || k.knowledge_id
       WHERE s.company_id = $1
       ORDER BY s.module_code`,
      [companyId]
    ),
    pool.query(
      `SELECT round(readiness_score, 2) AS readiness_score,
              modules_total, modules_approved, modules_draft,
              uncapped_level, effective_level, active_hard_caps
       FROM abix.v_company_readiness
       WHERE company_id = $1`,
      [companyId]
    ),
  ]);

  return NextResponse.json({
    modules: modules.rows,
    summary: summary.rows[0] ?? null,
  });
}
