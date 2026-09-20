import { pool } from './db';
import type { TokenUser } from './oauth';

// The tools the console's MCP server offers a connector (ChatGPT, Claude).
// They read and write the onboarding records through the same database
// functions the Onboarding screen uses, so every rule still holds: only the
// business owner approves, Not applicable needs a reason, an approved fact
// stays what customers see until a change is approved, every save is kept.
// Publishing to the customer-facing agent stays in the console.

type Json = Record<string, unknown>;
export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: Json;
  run: (args: Json, user: TokenUser) => Promise<Json>;
};

export class ToolError extends Error {}
const fail = (message: string): never => {
  throw new ToolError(message);
};

function text(args: Json, key: string, required = false): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === '') {
    if (required) fail(`"${key}" is required.`);
    return undefined;
  }
  if (typeof v !== 'string') fail(`"${key}" must be text.`);
  return v as string;
}

const today = () => new Date().toISOString().slice(0, 10);

// Database errors meant for people carry a CODE: prefix.
function friendly(message: string): string {
  const m = /^[A-Z_]+: ([\s\S]+)$/.exec(message);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : message;
}

async function db<T = Json>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    return (await pool.query(sql, params)).rows as T[];
  } catch (e) {
    return fail(friendly((e as Error).message));
  }
}

type Company = { company_id: string; company_code: string; display_name: string };

async function business(ref: string, user: TokenUser): Promise<Company> {
  const r = ref.trim();
  const rows = await db<Company>(
    `SELECT company_id, company_code, display_name FROM abix.companies
      WHERE upper(company_code) = upper($1) OR display_name ILIKE $1 OR display_name ILIKE '%' || $1 || '%'
      ORDER BY (upper(company_code) = upper($1)) DESC, (display_name ILIKE $1) DESC, company_code
      LIMIT 6`,
    [r]
  );
  if (rows.length === 0) fail(`No business matches "${ref}". Call list_businesses for the codes.`);
  const exact = rows.filter(
    (c) => c.company_code.toUpperCase() === r.toUpperCase() || c.display_name.toLowerCase() === r.toLowerCase()
  );
  let found: Company;
  if (exact.length === 1) found = exact[0];
  else if (rows.length > 1) {
    return fail(`"${ref}" matches several businesses: ${rows.map((c) => `${c.company_code} (${c.display_name})`).join(', ')}. Use the code.`);
  } else found = rows[0];
  // The connector acts for a person and never beyond their access (Users & Access): a business
  // they may not see is refused, and the refusal is recorded. Saving and approving are also
  // refused by the database unless their role allows it.
  const ok = await db<{ ok: boolean }>('SELECT abix.fn_access_can($1, $2, $3::uuid) AS ok', [
    user.username, 'workspace.view', found.company_id,
  ]);
  if (!ok[0]?.ok) {
    await db('SELECT abix.fn_access_log($1, $2, NULL, $3::uuid, $4, $5, $6::jsonb)', [
      user.username, 'connector: open a business', found.company_id, 'workspace.view', 'denied', '{}',
    ]);
    return fail(`Your access does not include ${found.display_name}.`);
  }
  return found;
}

// Fields marked restricted are not returned to someone without sensitive.view on that business, and
// reading them is recorded for someone who has it (Serge, 18 and 19 Sept). The connector never shows
// more than the person would see on screen.
async function hiddenFields(user: TokenUser, companyId: string): Promise<Set<string>> {
  const rows = await db<{ field_code: string }>('SELECT abix.fn_restricted_fields($1, $2::uuid) AS field_code', [
    user.username, companyId,
  ]);
  return new Set(rows.map((x) => x.field_code));
}

async function noteSensitive(user: TokenUser, companyId: string, what: string, count: number) {
  if (count > 0) {
    await db('SELECT abix.fn_log_sensitive_read($1, $2::uuid, $3, $4)', [user.username, companyId, what, count]);
  }
}

type Field = {
  field_code: string;
  section_code: string;
  label: string;
  input_kind: 'text' | 'choice' | 'table';
  choices: string[] | null;
  columns: string[] | null;
  brain_module_code: string;
  module_name: string;
  default_visibility: string;
  answered_by: string;
};

async function field(code: string): Promise<Field> {
  const rows = await db<Field>(
    `SELECT f.field_code, f.section_code, f.label, f.input_kind, f.choices, f.columns,
            f.brain_module_code, t.module_name, f.default_visibility, f.answered_by
       FROM abix.intake_fields f JOIN abix.brain_module_templates t ON t.module_code = f.brain_module_code
      WHERE f.field_code = $1`,
    [code]
  );
  if (!rows[0]) fail(`Unknown field_code "${code}". Call get_template with a section to see its field codes.`);
  return rows[0];
}

type Current = {
  value_text: string | null;
  value_rows: Json[] | null;
  status: string;
  visibility: string;
  source_ref: string | null;
  effective_date: string | null;
  review_date: string | null;
  note: string | null;
  blocking: boolean;
  gap_owner: string | null;
  gap_due: string | null;
  approved_snapshot: Json | null;
  version?: number;
};

async function current(companyId: string, code: string): Promise<Current | undefined> {
  const rows = await db<Current>(
    `SELECT value_text, value_rows, status, visibility, source_ref, effective_date::text AS effective_date,
            review_date::text AS review_date, note, blocking, gap_owner, gap_due::text AS gap_due, approved_snapshot
       FROM abix.intake_responses WHERE company_id = $1 AND field_code = $2`,
    [companyId, code]
  );
  return rows[0];
}

async function save(user: TokenUser, payload: Json): Promise<Current> {
  const rows = await db<{ r: Current }>('SELECT abix.fn_intake_save($1::jsonb) AS r', [
    JSON.stringify({ ...payload, actor: user.username }),
  ]);
  return rows[0].r;
}

async function moduleStatus(companyId: string, moduleCode: string) {
  const rows = await db(
    `SELECT r.derived_status, r.gap_note, m.status AS brain_status
       FROM abix.fn_intake_rollup($1) r
       LEFT JOIN abix.company_brain_modules m ON m.company_id = $1 AND m.module_code = r.module_code
      WHERE r.module_code = $2`,
    [companyId, moduleCode]
  );
  return rows[0] ?? null;
}

async function readiness(companyId: string) {
  const rows = await db(
    'SELECT current_score::float AS now, projected_score::float AS if_record_drives_brain FROM abix.fn_intake_brain_preview($1)',
    [companyId]
  );
  return rows[0] ?? null;
}

function shown(f: Field, r: Current | undefined) {
  return {
    field_code: f.field_code,
    label: f.label,
    status: r?.status ?? 'missing',
    ...(f.input_kind === 'table' ? { rows: r?.value_rows ?? [] } : { value: r?.value_text ?? null }),
    visibility: r?.visibility ?? f.default_visibility,
    source: r?.source_ref ?? null,
    note: r?.note ?? null,
  };
}

// Rows whose first column (the stable ID or name) matches an existing row
// update only the cells given; other rows are added. Nothing is lost.
function mergeRows(existing: Json[] | null, incoming: Json[], key: string): Json[] {
  const out = (existing ?? []).map((r) => ({ ...r }));
  for (const row of incoming) {
    const k = String(row[key] ?? '').trim().toLowerCase();
    const i = k ? out.findIndex((r) => String(r[key] ?? '').trim().toLowerCase() === k) : -1;
    if (i >= 0) out[i] = { ...out[i], ...row };
    else out.push(row);
  }
  return out;
}

// One save, shared by save_field and save_fields.
async function saveOne(c: Company, user: TokenUser, args: Json): Promise<Json> {
  const f = await field(text(args, 'field_code', true)!);
  const cur = await current(c.company_id, f.field_code);
  const hasValue = args.value !== undefined;
  const hasRows = args.rows !== undefined;
  if (hasValue && hasRows) fail('Give either value or rows, not both.');
  if (f.input_kind === 'table' && hasValue) fail(`${f.field_code} is a table: pass rows with the columns ${f.columns?.join(', ')}.`);
  if (f.input_kind !== 'table' && hasRows) fail(`${f.field_code} is not a table: pass value.`);

  let rows: Json[] | null = cur?.value_rows ?? null;
  if (hasRows) {
    if (!Array.isArray(args.rows)) fail('rows must be a list of objects.');
    const allowed = f.columns ?? [];
    (args.rows as unknown[]).forEach((row, i) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) fail(`Row ${i + 1} must be an object.`);
      const unknown = Object.keys(row as Json).filter((k) => !allowed.includes(k));
      if (unknown.length) fail(`Row ${i + 1} has unknown columns: ${unknown.join(', ')}. Columns: ${allowed.join(', ')}.`);
    });
    const mode = text(args, 'row_mode') ?? 'merge';
    if (!['merge', 'replace'].includes(mode)) fail('row_mode is merge or replace.');
    rows = mode === 'replace' ? (args.rows as Json[]) : mergeRows(cur?.value_rows ?? null, args.rows as Json[], allowed[0]);
  }

  const status = text(args, 'status') ?? 'under_review';
  if (!['under_review', 'draft'].includes(status)) fail('Use approve_fields to approve, or mark_not_applicable.');
  const newAnswer = hasValue || hasRows;
  const keep = <T>(key: string, existing: T) => (args[key] !== undefined ? args[key] : existing);

  const saved = await save(user, {
    company_id: c.company_id,
    field_code: f.field_code,
    status,
    value_text: hasValue ? args.value : cur?.value_text ?? null,
    value_rows: rows,
    visibility: keep('visibility', cur?.visibility ?? f.default_visibility),
    source_ref: text(args, 'source') ?? (newAnswer ? `${user.display_name} via ChatGPT, ${today()}` : cur?.source_ref ?? null),
    note: keep('note', cur?.note ?? null),
    blocking: keep('blocking', cur?.blocking ?? false),
    gap_owner: keep('gap_owner', cur?.gap_owner ?? null),
    gap_due: keep('gap_due', cur?.gap_due ?? null),
    effective_date: keep('effective_date', cur?.effective_date ?? null),
    review_date: keep('review_date', cur?.review_date ?? null),
    change_reason: text(args, 'change_reason') ?? 'Saved via ChatGPT',
    applies_to: text(args, 'applies_to'),
  });
  const snap = saved.approved_snapshot;
  return {
    saved: { ...shown(f, saved), version: saved.version },
    customers_see: snap ? `The version approved on ${String(snap.approved_at).slice(0, 10)}` : 'Nothing yet — not approved',
    brain_module: { code: f.brain_module_code, name: f.module_name, ...(await moduleStatus(c.company_id, f.brain_module_code)) },
  };
}

const BUSINESS = { type: 'string', description: 'Business code from list_businesses, e.g. CLIF, PROPERTIES, ABIX, SERGE_ABI.' };
const FIELD = { type: 'string', description: 'Field code from get_template or get_business_record, e.g. S05.prices.' };
const DATE = { type: 'string', description: 'A date as YYYY-MM-DD.' };

// The properties one answer may carry, for save_field and each save_fields item.
const ANSWER_PROPS: Json = {
  field_code: FIELD,
  value: { type: 'string', description: 'The answer, for text and choice fields.' },
  rows: {
    type: 'array',
    items: { type: 'object', additionalProperties: { type: 'string' } },
    description: "For table fields: rows as objects keyed by the field's column names.",
  },
  row_mode: {
    type: 'string',
    enum: ['merge', 'replace'],
    description:
      'merge (default): a row whose first column matches an existing row updates only the cells given; other rows are added. replace: the rows given replace all rows.',
  },
  status: {
    type: 'string',
    enum: ['under_review', 'draft'],
    description: 'under_review (default) when the owner stated or confirmed it; draft for a partial answer.',
  },
  visibility: {
    type: 'string',
    enum: ['public', 'internal', 'restricted'],
    description: 'public = the customer-facing agent may say it once approved. Defaults to the field default.',
  },
  source: {
    type: 'string',
    description: 'Where the fact comes from: a document, a link, or who said it. Defaults to the signed-in user via ChatGPT.',
  },
  note: { type: 'string', description: 'What is still missing, a conflict, or context. An empty string clears it.' },
  blocking: { type: 'boolean', description: 'True when this gap blocks a workflow from going live.' },
  gap_owner: { type: 'string', description: 'Who will fill the gap.' },
  gap_due: DATE,
  effective_date: DATE,
  review_date: DATE,
  change_reason: {
    type: 'string',
    enum: ['Price', 'Offer', 'Policy', 'SLA', 'Staff', 'System', 'Other'],
    description: 'Why an approved fact is changing.',
  },
  applies_to: {
    type: 'string',
    enum: ['New customers only', 'Existing and new customers'],
    description: 'Whom a change to an approved fact applies to.',
  },
};

const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export const TOOLS: Tool[] = [
  {
    name: 'list_businesses',
    title: 'List businesses',
    description:
      "Serge Abi's businesses in Aya, with each onboarding record's progress (fields approved, in review, draft, not applicable, still open) and Company Brain readiness. Start here to find a business's code. Any business can be onboarded: saving its first answer starts its record.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_args, user) => {
      const total = (await db<{ n: number }>('SELECT count(*)::int AS n FROM abix.intake_fields', []))[0].n;
      const rows = await db<Json & { approved: number; under_review: number; draft: number; not_applicable: number }>(
        `SELECT c.company_code AS code, c.display_name AS name, c.status,
                ic.company_id IS NOT NULL AS has_record, coalesce(ic.drives_brain, false) AS record_drives_brain,
                (count(r.*) FILTER (WHERE r.status = 'approved'))::int AS approved,
                (count(r.*) FILTER (WHERE r.status = 'under_review'))::int AS under_review,
                (count(r.*) FILTER (WHERE r.status = 'draft'))::int AS draft,
                (count(r.*) FILTER (WHERE r.status = 'not_applicable'))::int AS not_applicable,
                round(v.readiness_score, 1)::float AS brain_readiness
           FROM abix.companies c
           LEFT JOIN abix.intake_companies ic ON ic.company_id = c.company_id
           LEFT JOIN abix.intake_responses r ON r.company_id = c.company_id
           LEFT JOIN abix.v_company_readiness v ON v.company_id = c.company_id
          WHERE c.company_id IN (SELECT abix.fn_access_workspaces($1))
          GROUP BY c.company_code, c.display_name, c.status, ic.company_id, ic.drives_brain, v.readiness_score
          ORDER BY has_record DESC, c.company_code`,
        [user.username]
      );
      return {
        fields_per_record: total,
        businesses: rows.map((b) => ({
          ...b,
          still_open: total - b.approved - b.under_review - b.draft - b.not_applicable,
        })),
      };
    },
  },
  {
    name: 'get_template',
    title: 'Get the onboarding template',
    description:
      "Serge's onboarding template (v1.0): without a section, the list of sections; with a section, its fields — code, label, hint, input kind, choices or table columns, the Company Brain module each feeds, and who answers it (owner, or the technical team who prepares it for the owner to confirm).",
    inputSchema: {
      type: 'object',
      properties: { section: { type: 'string', description: 'Section code, e.g. S00, S05 or SUP_A. Omit to list sections.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      const section = text(args, 'section');
      if (!section) {
        return {
          sections: await db(
            `SELECT s.section_code AS code, s.title, s.kind, s.guidance, count(f.*)::int AS fields
               FROM abix.intake_sections s LEFT JOIN abix.intake_fields f ON f.section_code = s.section_code
              GROUP BY s.section_code, s.seq, s.title, s.kind, s.guidance ORDER BY s.seq`,
            []
          ),
        };
      }
      const rows = await db(
        `SELECT f.field_code, f.label, f.hint, f.input_kind, f.choices, f.columns,
                f.brain_module_code AS brain_module, t.module_name, f.default_visibility, f.answered_by, f.added_by_aya
           FROM abix.intake_fields f JOIN abix.brain_module_templates t ON t.module_code = f.brain_module_code
          WHERE upper(f.section_code) = upper($1) ORDER BY f.seq`,
        [section]
      );
      if (rows.length === 0) fail(`No section "${section}". Call get_template without a section to list them.`);
      return { section: section.toUpperCase(), fields: rows };
    },
  },
  {
    name: 'get_business_record',
    title: "Read a business's onboarding record",
    description:
      "A business's onboarding record. With a section and/or a status filter, the matching fields with their current answer, status, source, note, who answers it, and — if a change awaits approval — the approved version customers still see. Without either, a per-section summary. Use status 'open' for everything missing or in draft, and answered_by 'owner' for only the owner's questions.",
    inputSchema: {
      type: 'object',
      properties: {
        business: BUSINESS,
        section: { type: 'string', description: 'Section code, e.g. S05. Optional.' },
        status: {
          type: 'string',
          enum: ['open', 'missing', 'draft', 'under_review', 'approved', 'not_applicable'],
          description: 'Only fields with this status. "open" means missing or draft.',
        },
        answered_by: { type: 'string', enum: ['owner', 'technical'], description: 'Only the owner\'s fields, or only the technical team\'s.' },
      },
      required: ['business'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      const section = text(args, 'section');
      const status = text(args, 'status');
      const by = text(args, 'answered_by');
      if (!section && !status) {
        return {
          business: c.company_code,
          name: c.display_name,
          sections: await db(
            `SELECT s.section_code AS code, s.title,
                    count(f.*)::int AS fields,
                    (count(f.*) FILTER (WHERE r.status = 'approved'))::int AS approved,
                    (count(f.*) FILTER (WHERE r.status = 'under_review'))::int AS under_review,
                    (count(f.*) FILTER (WHERE r.status = 'draft'))::int AS draft,
                    (count(f.*) FILTER (WHERE r.status = 'not_applicable'))::int AS not_applicable,
                    (count(f.*) FILTER (WHERE coalesce(r.status, 'missing') = 'missing'))::int AS missing
               FROM abix.intake_sections s
               JOIN abix.intake_fields f ON f.section_code = s.section_code
               LEFT JOIN abix.intake_responses r ON r.company_id = $1 AND r.field_code = f.field_code
              WHERE ($2::text IS NULL OR f.answered_by = $2)
              GROUP BY s.section_code, s.seq, s.title ORDER BY s.seq`,
            [c.company_id, by ?? null]
          ),
          next: 'Call again with a section, or with status "open", to see the fields.',
        };
      }
      const rows = await db<Json>(
        `SELECT f.field_code, f.section_code AS section, f.label, f.hint, f.input_kind, f.choices, f.columns,
                f.brain_module_code AS brain_module, f.answered_by,
                coalesce(r.status, 'missing') AS status, r.value_text AS value, r.value_rows AS rows,
                coalesce(r.visibility, f.default_visibility) AS visibility, r.source_ref AS source, r.note,
                coalesce(r.blocking, false) AS blocking, r.gap_owner, r.gap_due::text AS gap_due,
                r.effective_date::text AS effective_date, r.review_date::text AS review_date,
                r.version, r.updated_by, r.updated_at,
                CASE WHEN r.approved_snapshot IS NOT NULL AND r.status <> 'approved'
                     THEN r.approved_snapshot END AS approved_version_customers_see
           FROM abix.intake_fields f
           JOIN abix.intake_sections s ON s.section_code = f.section_code
           LEFT JOIN abix.intake_responses r ON r.company_id = $1 AND r.field_code = f.field_code
          WHERE ($2::text IS NULL OR upper(f.section_code) = upper($2))
            AND ($3::text IS NULL
                 OR ($3 = 'open' AND coalesce(r.status, 'missing') IN ('missing', 'draft'))
                 OR coalesce(r.status, 'missing') = $3)
            AND ($4::text IS NULL OR f.answered_by = $4)
          ORDER BY s.seq, f.seq`,
        [c.company_id, section ?? null, status ?? null, by ?? null]
      );
      const hidden = await hiddenFields(user, c.company_id);
      const shown = (rows as unknown as { field_code: string; visibility: string }[])
        .filter((x) => !hidden.has(x.field_code));
      await noteSensitive(user, c.company_id, 'record through the connector',
        hidden.size === 0 ? shown.filter((x) => x.visibility === 'restricted').length : 0);
      const left_out = rows.length - shown.length;
      rows.length = 0;
      rows.push(...(shown as unknown as Json[]));
      const limit = 60;
      return {
        business: c.company_code,
        name: c.display_name,
        count: rows.length,
        ...(left_out > 0 ? { restricted_not_shown: left_out } : {}),
        fields: rows.slice(0, limit).map((r) => {
          const out: Json = {};
          for (const [k, v] of Object.entries(r)) if (v !== null && !(k === 'rows' && r.input_kind !== 'table')) out[k] = v;
          return out;
        }),
        ...(rows.length > limit ? { truncated: `Showing ${limit} of ${rows.length}; narrow by section.` } : {}),
      };
    },
  },
  {
    name: 'get_gaps',
    title: 'See what is left to reach 100%',
    description:
      "What stands between a business and a complete (100%) record: how many fields are left for the owner and for the technical team, the gaps that block a go-live, the gaps with a named question, readiness now and if the record drove the Brain, and each Brain module's status from the record.",
    inputSchema: { type: 'object', properties: { business: BUSINESS }, required: ['business'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      const [gaps, modules, left, settings] = await Promise.all([
        db<Json>(
          `SELECT f.field_code, f.label, f.section_code AS section, f.answered_by, r.status, r.note, r.blocking,
                  r.gap_owner, r.gap_due::text AS gap_due
             FROM abix.intake_responses r
             JOIN abix.intake_fields f ON f.field_code = r.field_code
             JOIN abix.intake_sections s ON s.section_code = f.section_code
            WHERE r.company_id = $1 AND (r.blocking OR (r.status IN ('missing', 'draft') AND r.note IS NOT NULL))
            ORDER BY r.blocking DESC, s.seq, f.seq`,
          [c.company_id]
        ),
        db(
          `SELECT r.module_code, t.module_name, t.readiness_weight::float AS weight, r.derived_status AS status_from_record,
                  m.status AS brain_status_now, r.approved, r.under_review, r.draft, r.missing, r.not_applicable,
                  r.gap_note AS still_to_fill
             FROM abix.fn_intake_rollup($1) r
             JOIN abix.brain_module_templates t ON t.module_code = r.module_code
             LEFT JOIN abix.company_brain_modules m ON m.company_id = $1 AND m.module_code = r.module_code
            ORDER BY t.seq`,
          [c.company_id]
        ),
        db<{ answered_by: string; missing: number; draft: number; under_review: number }>(
          `SELECT f.answered_by,
                  (count(*) FILTER (WHERE coalesce(r.status, 'missing') = 'missing'))::int AS missing,
                  (count(*) FILTER (WHERE r.status = 'draft'))::int AS draft,
                  (count(*) FILTER (WHERE r.status = 'under_review'))::int AS under_review
             FROM abix.intake_fields f
             LEFT JOIN abix.intake_responses r ON r.company_id = $1 AND r.field_code = f.field_code
            GROUP BY f.answered_by`,
          [c.company_id]
        ),
        db('SELECT drives_brain FROM abix.intake_companies WHERE company_id = $1', [c.company_id]),
      ]);
      // A gap on a restricted field is itself restricted information.
      const hidden = await hiddenFields(user, c.company_id);
      const openGaps = (gaps as unknown as { field_code: string }[]).filter((g) => !hidden.has(g.field_code));
      gaps.length = 0;
      gaps.push(...(openGaps as unknown as Json[]));
      const toGo = (who: string) => {
        const l = left.find((x) => x.answered_by === who) ?? { missing: 0, draft: 0, under_review: 0 };
        return { ...l, total: l.missing + l.draft + l.under_review };
      };
      return {
        business: c.company_code,
        name: c.display_name,
        to_reach_100: {
          owner: toGo('owner'),
          technical_team: toGo('technical'),
          how: 'Answer or mark not applicable every missing field, confirm the drafts, approve everything in review (approve_fields takes a whole section at once), then use_record_for_brain.',
        },
        readiness: await readiness(c.company_id),
        record_drives_brain: (settings[0] as Json | undefined)?.drives_brain ?? false,
        blocking: gaps.filter((g) => g.blocking),
        named_gaps: gaps.filter((g) => !g.blocking),
        modules,
      };
    },
  },
  {
    name: 'save_field',
    title: 'Save an answer to a field',
    description:
      "Save one answer the owner gave or confirmed in this conversation. Never invent a fact, price or policy, and never save something the user did not state or confirm. Saves as under_review by default (draft for a partial answer); approval is a separate step. Anything you leave out keeps its current value; table rows merge by their first column unless row_mode is replace. For several answers at once, use save_fields.",
    inputSchema: {
      type: 'object',
      properties: { business: BUSINESS, ...ANSWER_PROPS },
      required: ['business', 'field_code'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      return { business: c.company_code, ...(await saveOne(c, user, args)) };
    },
  },
  {
    name: 'save_fields',
    title: 'Save several answers at once',
    description:
      'Save up to 25 answers for one business in a single step — each item is saved like save_field, and one failing item does not stop the others. Only save what the owner stated or confirmed.',
    inputSchema: {
      type: 'object',
      properties: {
        business: BUSINESS,
        fields: {
          type: 'array',
          maxItems: 25,
          items: { type: 'object', properties: ANSWER_PROPS, required: ['field_code'], additionalProperties: false },
          description: 'The answers, each with its field_code.',
        },
      },
      required: ['business', 'fields'],
      additionalProperties: false,
    },
    annotations: WRITE,
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      if (!Array.isArray(args.fields) || args.fields.length === 0) fail('fields must be a non-empty list.');
      const items = args.fields as Json[];
      if (items.length > 25) fail('Save at most 25 answers per call.');
      const results: Json[] = [];
      for (const item of items) {
        try {
          results.push({ ok: true, ...(await saveOne(c, user, item ?? {})) });
        } catch (e) {
          results.push({ ok: false, field_code: item?.field_code, error: (e as Error).message });
        }
      }
      return {
        business: c.company_code,
        saved: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      };
    },
  },
  {
    name: 'approve_fields',
    title: 'Approve answers',
    description:
      "Approve answers for a business: a list of field codes, or a whole section at once. Every field in scope that has an answer and is not yet approved is approved — drafts included unless include_drafts is false; fields with no answer are skipped. Only the business owner (Serge) can approve, and only when he explicitly asks to approve those fields in this conversation — never on your own initiative.",
    inputSchema: {
      type: 'object',
      properties: {
        business: BUSINESS,
        field_codes: { type: 'array', items: { type: 'string' }, description: 'Fields to approve.' },
        section: { type: 'string', description: 'A section code, to approve every answered field in it.' },
        include_drafts: { type: 'boolean', description: 'Also approve drafts (default true). False approves only answers in review.' },
      },
      required: ['business'],
      additionalProperties: false,
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      if (!user.can_approve) fail('Only the business owner can approve. Save answers as under_review instead, and Serge approves them.');
      const codes = Array.isArray(args.field_codes) ? (args.field_codes as unknown[]).filter((x) => typeof x === 'string') : null;
      const section = text(args, 'section');
      if (!section && !(codes && codes.length)) fail('Give field_codes or a section.');
      const [r] = await db<{ r: Json }>('SELECT abix.fn_intake_approve_bulk($1::jsonb) AS r', [
        JSON.stringify({
          company_id: c.company_id,
          actor: user.username,
          field_codes: codes && codes.length ? codes : undefined,
          section_code: section,
          include_drafts: args.include_drafts !== false,
          via: 'ChatGPT',
        }),
      ]);
      return { business: c.company_code, ...r.r, readiness: await readiness(c.company_id) };
    },
  },
  {
    name: 'approve_field',
    title: "Approve one field's answer",
    description:
      "Approve one field's current answer. Only the business owner (Serge) can approve, and only when he explicitly asks to approve it in this conversation — never on your own initiative. For many fields, use approve_fields.",
    inputSchema: {
      type: 'object',
      properties: {
        business: BUSINESS,
        field_code: FIELD,
        source: { type: 'string', description: "Evidence to record with the approval. Defaults to the field's existing source." },
      },
      required: ['business', 'field_code'],
      additionalProperties: false,
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      const f = await field(text(args, 'field_code', true)!);
      if (!user.can_approve) fail('Only the business owner can approve. Save it as under_review instead, and Serge approves it.');
      const cur = await current(c.company_id, f.field_code);
      if (!cur || (!cur.value_text && !(cur.value_rows && cur.value_rows.length))) {
        fail(`Nothing to approve: ${f.field_code} has no answer yet.`);
      }
      const saved = await save(user, {
        company_id: c.company_id,
        field_code: f.field_code,
        status: 'approved',
        value_text: cur!.value_text,
        value_rows: cur!.value_rows,
        visibility: cur!.visibility,
        source_ref: text(args, 'source') ?? cur!.source_ref ?? `Approved by ${user.display_name} via ChatGPT, ${today()}`,
        note: cur!.note,
        blocking: false,
        gap_owner: cur!.gap_owner,
        gap_due: cur!.gap_due,
        effective_date: cur!.effective_date,
        review_date: cur!.review_date,
        change_reason: 'Approved via ChatGPT',
      });
      return {
        business: c.company_code,
        approved: { ...shown(f, saved), version: saved.version },
        brain_module: { code: f.brain_module_code, name: f.module_name, ...(await moduleStatus(c.company_id, f.brain_module_code)) },
        next:
          saved.visibility === 'public'
            ? 'Public: it reaches the agent the next time the business is published from the console.'
            : 'Not public: it informs the Brain but is never told to customers.',
      };
    },
  },
  {
    name: 'mark_not_applicable',
    title: 'Mark a field or section not applicable',
    description:
      "Mark a field, or every still-missing field of a section (such as a supplement for a business model the business does not have), as not applicable. A reason is required and is recorded. Only do this when the owner says it does not apply.",
    inputSchema: {
      type: 'object',
      properties: {
        business: BUSINESS,
        reason: { type: 'string', description: 'Why it does not apply.' },
        field_code: FIELD,
        section: { type: 'string', description: 'A section code, to mark all its still-missing fields.' },
      },
      required: ['business', 'reason'],
      additionalProperties: false,
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      const reason = text(args, 'reason', true)!;
      const code = text(args, 'field_code');
      const section = text(args, 'section');
      if (!!code === !!section) fail('Give either field_code or section.');
      if (section) {
        const [r] = await db<{ n: number }>('SELECT abix.fn_intake_mark_section($1::jsonb) AS n', [
          JSON.stringify({ company_id: c.company_id, section_code: section.toUpperCase(), note: reason, actor: user.username }),
        ]);
        return { business: c.company_code, section: section.toUpperCase(), marked_not_applicable: r.n };
      }
      const f = await field(code!);
      const cur = await current(c.company_id, f.field_code);
      const saved = await save(user, {
        company_id: c.company_id,
        field_code: f.field_code,
        status: 'not_applicable',
        value_text: cur?.value_text ?? null,
        value_rows: cur?.value_rows ?? null,
        visibility: cur?.visibility ?? f.default_visibility,
        source_ref: cur?.source_ref ?? null,
        note: reason,
        change_reason: 'Marked not applicable via ChatGPT',
      });
      return { business: c.company_code, marked: shown(f, saved) };
    },
  },
  {
    name: 'use_record_for_brain',
    title: "Let the record drive the business's Brain",
    description:
      "Make a business's Company Brain follow its onboarding record, field by field — the step that lets a Brain reach 100%. Readiness may fall at first while fields are still open, then rises with every approval; a module whose fields are all approved scores 100. For a business with no Brain yet, this creates its twenty modules. Only the owner, and only when he asks.",
    inputSchema: { type: 'object', properties: { business: BUSINESS }, required: ['business'], additionalProperties: false },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!, user);
      if (!user.can_approve) fail('Only the business owner can switch a Brain over to its record.');
      const [r] = await db<{ r: Json }>('SELECT abix.fn_intake_apply($1::uuid, $2, true) AS r', [c.company_id, user.username]);
      return { business: c.company_code, record_drives_brain: true, ...r.r };
    },
  },
];

export const INSTRUCTIONS =
  "Aya's onboarding records hold what the AI OS knows about each of Serge Abi's businesses, one field at a time. " +
  'To take a business to 100%: call get_gaps, ask the owner only the questions marked answered_by "owner" (the ' +
  'technical team prepares the rest), save what he states or confirms — several at once with save_fields — and ' +
  'never invent facts, prices or policies. Save answers as under_review; approve only when the owner explicitly asks ' +
  '(approve_fields takes a whole section at once). When he is ready, use_record_for_brain makes the Brain follow the ' +
  'record. Customers see nothing until the business is published from the console at https://ai.sergeabi.com.';
