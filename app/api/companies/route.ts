import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Reads the governance schema. Column names are aliased back to the shape the UI
// already uses, and `slug` keeps the legacy value so company_id params, the
// WhatsApp agent and public.contacts/leads all stay consistent.
export async function GET() {
  const { rows } = await pool.query(
    `SELECT company_id                        AS id,
            display_name                      AS name,
            coalesce(settings->>'legacy_slug', company_code) AS slug,
            company_type                      AS entity_type,
            parent_company_id                 AS parent_id,
            status
     FROM abix.companies
     ORDER BY company_type = 'portfolio' DESC, display_name ASC`
  );
  return NextResponse.json(rows);
}
