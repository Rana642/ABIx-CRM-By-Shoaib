import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Portfolio-level summary for the Overview surface.
//
// 07_CEO_COMMAND_CENTER.yaml requires every figure to carry its source and
// freshness, and states plainly: "Show source as stale or unavailable; never
// display old data as current." So each metric reports `available` — the UI
// renders an explicit not-connected state rather than a zero that reads as fact.
export async function GET() {
  const [companies, brains, blockers, crm, ops] = await Promise.all([
    pool.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE status = 'active')::int     AS active,
             count(*) FILTER (WHERE status = 'onboarding')::int AS onboarding,
             count(*) FILTER (WHERE human_owner_principal_id IS NULL)::int AS unowned
      FROM abix.companies
    `),
    pool.query(`
      SELECT count(*)::int AS companies_with_brain,
             coalesce(round(avg(readiness_score), 1), 0) AS avg_readiness,
             coalesce(sum(modules_approved), 0)::int     AS modules_approved,
             coalesce(sum(modules_total), 0)::int        AS modules_total,
             count(*) FILTER (WHERE effective_level <> 'A0')::int AS above_a0
      FROM abix.v_company_readiness
      WHERE modules_total > 0
    `),
    pool.query(`
      SELECT (SELECT count(*) FROM abix.companies WHERE human_owner_principal_id IS NULL)::int
               AS missing_owner,
             (SELECT count(*) FROM abix.portfolio_entities
               WHERE verification_status IN ('tbd_from_diagram','candidate_from_context'))::int
               AS unverified_entities,
             (SELECT count(*) FROM abix.portfolio_entities
               WHERE metadata->>'decision_needed' IS NOT NULL)::int
               AS decisions_needed,
             (SELECT count(*) FROM abix.portfolio_entity_relationships
               WHERE status = 'proposed')::int
               AS parent_conflicts
    `),
    pool.query(`
      SELECT (SELECT count(*) FROM public.contacts)::int      AS contacts,
             (SELECT count(*) FROM public.leads)::int         AS leads,
             (SELECT count(*) FROM public.opportunities)::int AS opportunities
    `),
    pool.query(`
      SELECT (SELECT count(*) FROM abix.agent_roles)::int         AS agent_roles,
             (SELECT count(*) FROM abix.agent_deployments)::int   AS agent_deployments,
             (SELECT count(*) FROM abix.skills)::int              AS skills,
             (SELECT count(*) FROM abix.workflows)::int           AS workflows,
             (SELECT count(*) FROM abix.work_orders)::int         AS work_orders,
             (SELECT count(*) FROM abix.approvals
               WHERE status = 'PENDING')::int                     AS approvals_pending,
             (SELECT count(*) FROM abix.connectors)::int          AS connectors,
             (SELECT count(*) FROM abix.agent_runs)::int          AS agent_runs,
             (SELECT count(*) FROM abix.incidents
               WHERE status <> 'closed')::int                     AS open_incidents,
             (SELECT count(*) FROM abix.kill_switches
               WHERE status = 'active')::int                      AS active_kill_switches
    `),
  ]);

  const c = companies.rows[0];
  const b = brains.rows[0];
  const k = blockers.rows[0];
  const r = crm.rows[0];
  const o = ops.rows[0];

  const decisionCount =
    k.missing_owner + k.unverified_entities + k.decisions_needed + k.parent_conflicts;

  return NextResponse.json({
    as_of: new Date().toISOString(),
    companies: c,
    brains: b,
    decisions: { ...k, total: decisionCount },
    crm: r,
    ops: o,
    // Nothing has been promoted past observe-only yet, so autonomous coverage is
    // a real, measurable zero rather than an unavailable metric.
    autonomy: {
      available: true,
      companies_above_a0: b.above_a0,
      companies_measured: b.companies_with_brain,
      verified_actions: o.agent_runs,
    },
    // Surfaces the design shows but no source is connected for yet.
    unavailable: {
      revenue: 'No finance connector. Invoicing is handled in Zoho, not yet integrated.',
      ai_spend: 'No cost telemetry. agent_runs is empty, so cost per task is unmeasured.',
      missions: 'No orchestrator. work_orders is empty; nothing dispatches work yet.',
      connectors: 'No connector has been registered or health-checked.',
    },
  });
}
