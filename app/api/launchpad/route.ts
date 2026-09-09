import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Readiness comes from abix.v_company_readiness, which implements the official
// weighted formula from 08_COMPANY_BRAIN_ONBOARDING.yaml
// (sum(module_score * weight) / 100) and applies the hard caps. It replaces the
// earlier `approved / 20 * 100`, which ignored module weights entirely.
export async function GET() {
  const { rows } = await pool.query(`
    SELECT c.company_id                       AS id,
           c.display_name                     AS name,
           coalesce(c.settings->>'legacy_slug', c.company_code) AS slug,
           c.company_type                     AS entity_type,
           c.status,
           p.display_name                     AS parent_name,
           r.modules_total,
           r.modules_approved,
           r.modules_draft,
           round(r.readiness_score)           AS readiness_pct,
           r.uncapped_level,
           r.effective_level,
           r.active_hard_caps,
           q.state                            AS onboarding_state,
           q.priority                         AS onboarding_priority,
           q.stages_passed,
           CASE
             WHEN c.status = 'active'          THEN 'live'
             WHEN r.modules_total = 0          THEN 'not_started'
             WHEN r.readiness_score >= 65      THEN 'brain_ready'
             ELSE 'in_progress'
           END                                AS stage,
           (c.status = 'active')              AS is_live
    FROM abix.companies c
    LEFT JOIN abix.v_company_readiness r ON r.company_id = c.company_id
    LEFT JOIN abix.companies p            ON p.company_id = c.parent_company_id
    LEFT JOIN abix.v_company_launchpad_queue q ON q.company_id = c.company_id
    ORDER BY r.readiness_score DESC NULLS LAST, c.display_name ASC;
  `);
  return NextResponse.json(rows);
}
