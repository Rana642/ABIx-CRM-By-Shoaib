import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { actorOf } from '@/lib/access';

export const dynamic = 'force-dynamic';

// Only the workspaces the signed-in person may see (Users & Access).
// Reads the governance schema. Column names are aliased back to the shape the UI
// already uses, and `slug` keeps the legacy value so company_id params, the
// WhatsApp agent and public.contacts/leads all stay consistent.
export async function GET(req: NextRequest) {
  const { rows } = await pool.query(
    `SELECT company_id                        AS id,
            display_name                      AS name,
            coalesce(settings->>'legacy_slug', company_code) AS slug,
            company_type                      AS entity_type,
            parent_company_id                 AS parent_id,
            status
     FROM abix.companies
     WHERE company_id IN (SELECT abix.fn_access_workspaces($1))
     ORDER BY company_type = 'portfolio' DESC, display_name ASC`,
    [actorOf(req)]
  );
  return NextResponse.json(rows);
}
