import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { buildChunks, publishChunks, type PublishableRow } from '@/lib/intakePublish';

export const dynamic = 'force-dynamic';

// The agent's knowledge base, reached over the internal Docker network.
const KB_TARGET = {
  qdrantUrl: process.env.QDRANT_URL ?? 'http://qdrant:6333',
  ollamaUrl: process.env.OLLAMA_URL ?? 'http://ollama:11434',
  collection: process.env.KB_COLLECTION ?? 'clif_knowledge',
};

// The business onboarding & update record (Serge's template v1.0). Every rule —
// who may approve, what a Not applicable needs, how the Brain follows — lives in
// the database functions from 28_INTAKE.sql; this route only passes requests on.

// Set by middleware.ts after the password check, so the browser cannot choose it.
function actorOf(req: NextRequest): string {
  return req.headers.get('x-console-user') ?? '';
}

// Database errors that are meant for the person filling in the record carry a
// CODE: prefix; show the sentence after it. Anything else is a real fault.
function friendly(message: string): string {
  const m = /^[A-Z_]+: ([\s\S]+)$/.exec(message);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : `Something went wrong: ${message}`;
}

const SAVE_KEYS = [
  'company_id', 'field_code', 'status', 'value_text', 'value_rows', 'visibility', 'source_ref',
  'effective_date', 'review_date', 'note', 'blocking', 'gap_owner', 'gap_due', 'change_reason',
  'applies_to',
] as const;

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('company_id');
  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }

  const historyOf = req.nextUrl.searchParams.get('history');
  if (historyOf) {
    const { rows } = await pool.query(
      `SELECT version, snapshot->>'status' AS status, snapshot->>'value_text' AS value_text,
              snapshot->'value_rows' AS value_rows, snapshot->>'source_ref' AS source_ref,
              change_reason, applies_to, changed_by, changed_at
       FROM abix.intake_response_history
       WHERE company_id = $1 AND field_code = $2
       ORDER BY version DESC
       LIMIT 20`,
      [companyId, historyOf]
    );
    return NextResponse.json({ history: rows });
  }

  const [sections, fields, responses, rollup, preview, settings, me] = await Promise.all([
    pool.query(
      `SELECT section_code, seq, title, kind, guidance FROM abix.intake_sections ORDER BY seq`
    ),
    pool.query(
      `SELECT f.field_code, f.section_code, f.seq, f.label, f.hint, f.input_kind, f.choices,
              f.columns, f.seed_rows, f.brain_module_code, t.module_name,
              f.default_visibility, f.added_by_aya
       FROM abix.intake_fields f
       JOIN abix.intake_sections s ON s.section_code = f.section_code
       JOIN abix.brain_module_templates t ON t.module_code = f.brain_module_code
       ORDER BY s.seq, f.seq`
    ),
    pool.query(
      `SELECT field_code, value_text, value_rows, status, visibility, source_ref,
              effective_date::text AS effective_date, review_date::text AS review_date, note,
              blocking, gap_owner, gap_due::text AS gap_due, approved_snapshot, approved_by,
              approved_at, version, updated_by, updated_at
       FROM abix.intake_responses
       WHERE company_id = $1`,
      [companyId]
    ),
    pool.query(
      `SELECT r.module_code, r.fields_total, r.approved, r.under_review, r.draft, r.missing,
              r.not_applicable, r.derived_status, r.evidence_complete, r.gap_note,
              t.module_name, t.readiness_weight, t.is_critical, m.status AS brain_status
       FROM abix.fn_intake_rollup($1) r
       JOIN abix.brain_module_templates t ON t.module_code = r.module_code
       LEFT JOIN abix.company_brain_modules m
              ON m.company_id = $1 AND m.module_code = r.module_code
       ORDER BY t.seq`,
      [companyId]
    ),
    pool.query(`SELECT current_score, projected_score FROM abix.fn_intake_brain_preview($1)`, [
      companyId,
    ]),
    pool.query(
      `SELECT drives_brain, adopted_at, adopted_by, published_at, published_by, published_facts
       FROM abix.intake_companies WHERE company_id = $1`,
      [companyId]
    ),
    pool.query(
      `SELECT username, display_name, can_approve FROM abix.console_users WHERE username = $1`,
      [actorOf(req)]
    ),
  ]);

  return NextResponse.json({
    sections: sections.rows,
    fields: fields.rows,
    responses: responses.rows,
    rollup: rollup.rows,
    preview: preview.rows[0] ?? null,
    settings: settings.rows[0] ?? { drives_brain: false, adopted_at: null, adopted_by: null },
    me: me.rows[0] ?? null,
  });
}

export async function POST(req: NextRequest) {
  const actor = actorOf(req);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'The request was not valid JSON.' }, { status: 400 });
  }

  try {
    if (body.action === 'mark_section') {
      const { rows } = await pool.query('SELECT abix.fn_intake_mark_section($1::jsonb) AS n', [
        JSON.stringify({
          company_id: body.company_id,
          section_code: body.section_code,
          note: body.note,
          actor,
        }),
      ]);
      return NextResponse.json({ marked: rows[0].n });
    }

    if (body.action === 'publish') {
      // Checked before anything is written to the knowledge base.
      const allowed = await pool.query('SELECT abix.fn_intake_can_publish($1) AS ok', [actor]);
      if (!allowed.rows[0]?.ok) {
        return NextResponse.json({ error: 'Only the business owner publishes to the agent.' }, { status: 403 });
      }
      const { rows } = await pool.query<PublishableRow>(
        `SELECT company_code, company_name, section_title, field_code, label, input_kind,
                columns, value_text, value_rows
         FROM abix.v_intake_publishable_named
         WHERE company_id = $1
         ORDER BY section_seq, field_seq`,
        [body.company_id]
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Nothing is approved and public yet.' }, { status: 400 });
      }
      const now = new Date();
      const chunks = buildChunks(
        rows,
        now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' })
      );
      const { points } = await publishChunks(KB_TARGET, rows[0].company_code, chunks, now.toISOString());
      const rec = await pool.query('SELECT abix.fn_intake_record_publication($1::uuid, $2, $3, $4, $5) AS r', [
        body.company_id,
        actor,
        rows.length,
        points,
        KB_TARGET.collection,
      ]);
      return NextResponse.json(rec.rows[0].r);
    }

    if (body.action === 'adopt') {
      const { rows } = await pool.query('SELECT abix.fn_intake_apply($1::uuid, $2, true) AS r', [
        body.company_id,
        actor,
      ]);
      return NextResponse.json(rows[0].r);
    }

    const payload: Record<string, unknown> = { actor };
    for (const k of SAVE_KEYS) if (k in body) payload[k] = body[k];
    const { rows } = await pool.query('SELECT abix.fn_intake_save($1::jsonb) AS r', [
      JSON.stringify(payload),
    ]);
    return NextResponse.json(rows[0].r);
  } catch (e) {
    return NextResponse.json({ error: friendly((e as Error).message) }, { status: 400 });
  }
}
