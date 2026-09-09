import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The decision queue: everything currently blocked on a human, generated from
// the portfolio manifest and the readiness hard caps rather than hand-maintained.
export async function GET() {
  const { rows } = await pool.query(`
    -- 1. The single highest-leverage blocker: no company has a named human owner,
    --    which hard-caps every one of them at A0 regardless of Brain readiness.
    SELECT 'missing_owner'                                  AS kind,
           'critical'                                       AS severity,
           'No accountable human owner named'                AS title,
           'Every company is capped at autonomy A0 until an owner is recorded. '
             || 'This is the single input that unlocks all the others.'          AS detail,
           jsonb_agg(jsonb_build_object(
             'label', display_name,
             'note',  'readiness ' || coalesce(round(brain_readiness_score)::text, '0') || '%')
             ORDER BY brain_readiness_score DESC NULLS LAST) AS subjects
    FROM abix.companies
    WHERE human_owner_principal_id IS NULL

    UNION ALL

    -- 2. Diagram nodes that were never named. Held as literal TBD records.
    SELECT 'unnamed_entity',
           'critical',
           'Unnamed entity from the portfolio diagram',
           'Needs name, location, ownership, operating status and system-of-record '
             || 'before onboarding can start.',
           jsonb_agg(jsonb_build_object(
             'label', display_name,
             'note',  coalesce(metadata->>'hard_blocker', 'awaiting name'))
             ORDER BY entity_code)
    FROM abix.portfolio_entities
    WHERE verification_status = 'tbd_from_diagram'

    UNION ALL

    -- 3. Entities carrying an explicit decision_needed in the manifest.
    SELECT 'decision_needed',
           'high',
           'Classification or ownership decision needed',
           'The manifest records an open question against these entities.',
           jsonb_agg(jsonb_build_object(
             'label', display_name,
             'note',  metadata->>'decision_needed')
             ORDER BY entity_code)
    FROM abix.portfolio_entities
    WHERE metadata->>'decision_needed' IS NOT NULL

    UNION ALL

    -- 4. Where the manifest hierarchy disagrees with the live hierarchy. Recorded
    --    as proposed relationships, never auto-applied.
    SELECT 'parent_conflict',
           'high',
           'Parent disagrees between diagram and live system',
           'The portfolio diagram places these under a different parent than the '
             || 'running system. Affects Pod design and the approver map.',
           jsonb_agg(jsonb_build_object(
             'label', t.display_name,
             'note',  'diagram says under ' || f.display_name)
             ORDER BY t.entity_code)
    FROM abix.portfolio_entity_relationships rel
    JOIN abix.portfolio_entities f ON f.portfolio_entity_id = rel.from_entity_id
    JOIN abix.portfolio_entities t ON t.portfolio_entity_id = rel.to_entity_id
    WHERE rel.status = 'proposed'

    UNION ALL

    -- 5. Candidates that may or may not be real entities.
    SELECT 'unverified_candidate',
           'medium',
           'Unverified candidate entity',
           'Recorded from context rather than the diagram. Confirm whether each is '
             || 'a real entity before it is onboarded.',
           jsonb_agg(jsonb_build_object(
             'label', display_name,
             'note',  coalesce(notes, 'confirm whether this exists as a distinct entity'))
             ORDER BY entity_code)
    FROM abix.portfolio_entities
    WHERE verification_status = 'candidate_from_context';
  `);

  // Drop any bucket that matched nothing.
  return NextResponse.json(rows.filter((r) => r.subjects !== null));
}
