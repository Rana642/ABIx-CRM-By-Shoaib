import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { rows } = await pool.query(`
    WITH brain_stats AS (
      SELECT company_id,
             count(*) AS modules_total,
             count(*) FILTER (WHERE status = 'approved') AS modules_approved,
             count(*) FILTER (WHERE status = 'draft') AS modules_draft
      FROM company_brains
      GROUP BY company_id
    )
    SELECT c.id, c.name, c.slug, c.entity_type, c.parent_id, p.name AS parent_name,
           coalesce(b.modules_total, 0) AS modules_total,
           coalesce(b.modules_approved, 0) AS modules_approved,
           coalesce(b.modules_draft, 0) AS modules_draft,
           round(coalesce(b.modules_approved, 0)::numeric / 20 * 100) AS readiness_pct,
           CASE
             WHEN coalesce(b.modules_total, 0) = 0 THEN 'not_started'
             WHEN b.modules_total < 20 THEN 'in_progress'
             WHEN b.modules_approved = 20 THEN 'brain_complete'
             ELSE 'brain_drafted'
           END AS stage,
           (c.slug = 'clif') AS is_live
    FROM companies c
    LEFT JOIN brain_stats b ON b.company_id = c.id
    LEFT JOIN companies p ON p.id = c.parent_id
    ORDER BY readiness_pct DESC NULLS LAST, c.name ASC;
  `);
  return NextResponse.json(rows);
}
