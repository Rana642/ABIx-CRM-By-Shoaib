import { pool } from './db';
import type { TokenUser } from './oauth';

// The tools the console's MCP server offers a connector (ChatGPT, Claude).
// They read and write the onboarding records through the same database
// functions the Onboarding screen uses, so every rule still holds: only the
// business owner approves, Not applicable needs a reason, an approved fact
// stays what customers see until a change is approved, every save is kept.
// Switching a Brain over and publishing to the agent stay in the console.

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

type Company = { company_id: string; company_code: string; display_name: string };

async function business(ref: string): Promise<Company> {
  const r = ref.trim();
  const { rows } = await pool.query<Company>(
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
  if (exact.length === 1) return exact[0];
  if (rows.length > 1) {
    fail(`"${ref}" matches several businesses: ${rows.map((c) => `${c.company_code} (${c.display_name})`).join(', ')}. Use the code.`);
  }
  return rows[0];
}

type Field = {
  field_code: string;
  section_code: string;
  label: string;
  hint: string | null;
  input_kind: 'text' | 'choice' | 'table';
  choices: string[] | null;
  columns: string[] | null;
  brain_module_code: string;
  module_name: string;
  default_visibility: string;
};

async function field(code: string): Promise<Field> {
  const { rows } = await pool.query<Field>(
    `SELECT f.field_code, f.section_code, f.label, f.hint, f.input_kind, f.choices, f.columns,
            f.brain_module_code, t.module_name, f.default_visibility
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
};

async function current(companyId: string, code: string): Promise<Current | undefined> {
  const { rows } = await pool.query<Current>(
    `SELECT value_text, value_rows, status, visibility, source_ref, effective_date::text AS effective_date,
            review_date::text AS review_date, note, blocking, gap_owner, gap_due::text AS gap_due, approved_snapshot
       FROM abix.intake_responses WHERE company_id = $1 AND field_code = $2`,
    [companyId, code]
  );
  return rows[0];
}

async function save(user: TokenUser, payload: Json): Promise<Json> {
  try {
    const { rows } = await pool.query('SELECT abix.fn_intake_save($1::jsonb) AS r', [
      JSON.stringify({ ...payload, actor: user.username }),
    ]);
    return rows[0].r as Json;
  } catch (e) {
    return fail(friendly((e as Error).message));
  }
}

async function moduleStatus(companyId: string, moduleCode: string) {
  const { rows } = await pool.query(
    `SELECT r.derived_status, r.gap_note, m.status AS brain_status
       FROM abix.fn_intake_rollup($1) r
       LEFT JOIN abix.company_brain_modules m ON m.company_id = $1 AND m.module_code = r.module_code
      WHERE r.module_code = $2`,
    [companyId, moduleCode]
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

const BUSINESS = { type: 'string', description: 'Business code from list_businesses, e.g. CLIF, PROPERTIES, ABIX, SERGE_ABI.' };
const FIELD = { type: 'string', description: 'Field code from get_template or get_business_record, e.g. S05.prices.' };
const DATE = { type: 'string', description: 'A date as YYYY-MM-DD.' };

export const TOOLS: Tool[] = [
  {
    name: 'list_businesses',
    title: 'List businesses',
    description:
      "Serge Abi's businesses in Aya, with each onboarding record's progress (fields approved, in review, draft, not applicable, still open) and Company Brain readiness. Start here to find a business's code.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async () => {
      const total = (await pool.query('SELECT count(*)::int AS n FROM abix.intake_fields')).rows[0].n as number;
      const { rows } = await pool.query(
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
          GROUP BY c.company_code, c.display_name, c.status, ic.company_id, ic.drives_brain, v.readiness_score
          ORDER BY has_record DESC, c.company_code`
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
      "Serge's onboarding template (v1.0): without a section, the list of sections; with a section, its fields — code, label, hint, input kind, choices or table columns, and the Company Brain module each feeds.",
    inputSchema: {
      type: 'object',
      properties: { section: { type: 'string', description: 'Section code, e.g. S00, S05 or SUP_A. Omit to list sections.' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      const section = text(args, 'section');
      if (!section) {
        const { rows } = await pool.query(
          `SELECT s.section_code AS code, s.title, s.kind, s.guidance, count(f.*)::int AS fields
             FROM abix.intake_sections s LEFT JOIN abix.intake_fields f ON f.section_code = s.section_code
            GROUP BY s.section_code, s.seq, s.title, s.kind, s.guidance ORDER BY s.seq`
        );
        return { sections: rows };
      }
      const { rows } = await pool.query(
        `SELECT f.field_code, f.label, f.hint, f.input_kind, f.choices, f.columns,
                f.brain_module_code AS brain_module, t.module_name, f.default_visibility, f.added_by_aya
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
      "A business's onboarding record. With a section and/or a status filter, the matching fields with their current answer, status, source, note and — if a change awaits approval — the approved version customers still see. Without either, a per-section summary. Use status 'open' for everything still missing or in draft.",
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
      },
      required: ['business'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      const c = await business(text(args, 'business', true)!);
      const section = text(args, 'section');
      const status = text(args, 'status');
      if (!section && !status) {
        const { rows } = await pool.query(
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
            GROUP BY s.section_code, s.seq, s.title ORDER BY s.seq`,
          [c.company_id]
        );
        return {
          business: c.company_code,
          name: c.display_name,
          sections: rows,
          next: 'Call again with a section, or with status "open", to see the fields.',
        };
      }
      const { rows } = await pool.query(
        `SELECT f.field_code, f.section_code AS section, f.label, f.hint, f.input_kind, f.choices, f.columns,
                f.brain_module_code AS brain_module,
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
          ORDER BY s.seq, f.seq`,
        [c.company_id, section ?? null, status ?? null]
      );
      const limit = 60;
      return {
        business: c.company_code,
        name: c.display_name,
        count: rows.length,
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
    title: "See what is missing for a business",
    description:
      "What is still missing or blocking for a business: the gaps that block a go-live, the gaps with a named question, readiness now and if the record drove the Brain, and each Brain module's status from the record.",
    inputSchema: { type: 'object', properties: { business: BUSINESS }, required: ['business'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      const c = await business(text(args, 'business', true)!);
      const [gaps, modules, preview, settings] = await Promise.all([
        pool.query(
          `SELECT f.field_code, f.label, f.section_code AS section, r.status, r.note, r.blocking, r.gap_owner,
                  r.gap_due::text AS gap_due
             FROM abix.intake_responses r
             JOIN abix.intake_fields f ON f.field_code = r.field_code
             JOIN abix.intake_sections s ON s.section_code = f.section_code
            WHERE r.company_id = $1 AND (r.blocking OR (r.status IN ('missing', 'draft') AND r.note IS NOT NULL))
            ORDER BY r.blocking DESC, s.seq, f.seq`,
          [c.company_id]
        ),
        pool.query(
          `SELECT r.module_code, t.module_name, t.readiness_weight::float AS weight, r.derived_status AS status_from_record,
                  m.status AS brain_status_now, r.approved, r.under_review, r.draft, r.missing, r.not_applicable,
                  r.gap_note AS still_to_fill
             FROM abix.fn_intake_rollup($1) r
             JOIN abix.brain_module_templates t ON t.module_code = r.module_code
             LEFT JOIN abix.company_brain_modules m ON m.company_id = $1 AND m.module_code = r.module_code
            ORDER BY t.seq`,
          [c.company_id]
        ),
        pool.query('SELECT current_score::float AS now, projected_score::float AS if_record_drives_brain FROM abix.fn_intake_brain_preview($1)', [
          c.company_id,
        ]),
        pool.query('SELECT drives_brain FROM abix.intake_companies WHERE company_id = $1', [c.company_id]),
      ]);
      return {
        business: c.company_code,
        name: c.display_name,
        readiness: preview.rows[0] ?? null,
        record_drives_brain: settings.rows[0]?.drives_brain ?? false,
        blocking: gaps.rows.filter((g) => g.blocking),
        named_gaps: gaps.rows.filter((g) => !g.blocking),
        modules: modules.rows,
      };
    },
  },
  {
    name: 'save_field',
    title: 'Save an answer to a field',
    description:
      "Save an answer the owner gave or confirmed in this conversation. Never invent a fact, price or policy, and never save something the user did not state or confirm. Saves as under_review by default (draft for a partial answer); approval is a separate step. Fields you leave out keep their current value. For a table field, pass every row — the list replaces the existing rows. Customers see nothing until a fact is approved and published from the console.",
    inputSchema: {
      type: 'object',
      properties: {
        business: BUSINESS,
        field_code: FIELD,
        value: { type: 'string', description: 'The answer, for text and choice fields.' },
        rows: {
          type: 'array',
          items: { type: 'object', additionalProperties: { type: 'string' } },
          description: "For table fields: all rows, each an object keyed by the field's column names.",
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
      },
      required: ['business', 'field_code'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!);
      const f = await field(text(args, 'field_code', true)!);
      const cur = await current(c.company_id, f.field_code);
      const hasValue = args.value !== undefined;
      const hasRows = args.rows !== undefined;
      if (hasValue && hasRows) fail('Give either value or rows, not both.');
      if (f.input_kind === 'table' && hasValue) fail(`${f.field_code} is a table: pass rows with the columns ${f.columns?.join(', ')}.`);
      if (f.input_kind !== 'table' && hasRows) fail(`${f.field_code} is not a table: pass value.`);
      if (hasRows) {
        if (!Array.isArray(args.rows)) fail('rows must be a list of objects.');
        const allowed = f.columns ?? [];
        (args.rows as unknown[]).forEach((row, i) => {
          if (typeof row !== 'object' || row === null || Array.isArray(row)) fail(`Row ${i + 1} must be an object.`);
          const unknown = Object.keys(row as Json).filter((k) => !allowed.includes(k));
          if (unknown.length) fail(`Row ${i + 1} has unknown columns: ${unknown.join(', ')}. Columns: ${allowed.join(', ')}.`);
        });
      }
      const status = text(args, 'status') ?? 'under_review';
      if (!['under_review', 'draft'].includes(status)) fail('Use approve_field to approve, or mark_not_applicable.');
      const newAnswer = hasValue || hasRows;
      const keep = <T>(key: string, existing: T) => (args[key] !== undefined ? args[key] : existing);

      const saved = await save(user, {
        company_id: c.company_id,
        field_code: f.field_code,
        status,
        value_text: hasValue ? args.value : cur?.value_text ?? null,
        value_rows: hasRows ? args.rows : cur?.value_rows ?? null,
        visibility: keep('visibility', cur?.visibility ?? f.default_visibility),
        source_ref:
          text(args, 'source') ?? (newAnswer ? `${user.display_name} via ChatGPT, ${today()}` : cur?.source_ref ?? null),
        note: keep('note', cur?.note ?? null),
        blocking: keep('blocking', cur?.blocking ?? false),
        gap_owner: keep('gap_owner', cur?.gap_owner ?? null),
        gap_due: keep('gap_due', cur?.gap_due ?? null),
        effective_date: keep('effective_date', cur?.effective_date ?? null),
        review_date: keep('review_date', cur?.review_date ?? null),
        change_reason: text(args, 'change_reason') ?? 'Saved via ChatGPT',
        applies_to: text(args, 'applies_to'),
      });
      const snap = saved.approved_snapshot as Json | null;
      return {
        business: c.company_code,
        saved: { ...shown(f, saved as unknown as Current), version: saved.version },
        customers_see: snap ? `The version approved on ${String(snap.approved_at).slice(0, 10)}` : 'Nothing yet — not approved',
        brain_module: { code: f.brain_module_code, name: f.module_name, ...(await moduleStatus(c.company_id, f.brain_module_code)) },
      };
    },
  },
  {
    name: 'approve_field',
    title: "Approve a field's answer",
    description:
      "Approve a field's current answer. Only the business owner (Serge) can approve, and only when he explicitly asks to approve it in this conversation — never approve on your own initiative. Once approved, a public fact can be published to the customer-facing agent from the console.",
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!);
      const f = await field(text(args, 'field_code', true)!);
      if (!user.can_approve) {
        fail('Only the business owner can approve. Save it as under_review instead, and Serge approves it.');
      }
      const cur = await current(c.company_id, f.field_code);
      const empty = !cur || (!cur.value_text && !(cur.value_rows && cur.value_rows.length));
      if (empty) fail(`Nothing to approve: ${f.field_code} has no answer yet.`);
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
        approved: { ...shown(f, saved as unknown as Current), version: saved.version },
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (args, user) => {
      const c = await business(text(args, 'business', true)!);
      const reason = text(args, 'reason', true)!;
      const code = text(args, 'field_code');
      const section = text(args, 'section');
      if (!!code === !!section) fail('Give either field_code or section.');
      if (section) {
        try {
          const { rows } = await pool.query('SELECT abix.fn_intake_mark_section($1::jsonb) AS n', [
            JSON.stringify({ company_id: c.company_id, section_code: section.toUpperCase(), note: reason, actor: user.username }),
          ]);
          return { business: c.company_code, section: section.toUpperCase(), marked_not_applicable: rows[0].n };
        } catch (e) {
          return fail(friendly((e as Error).message));
        }
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
      return { business: c.company_code, marked: shown(f, saved as unknown as Current) };
    },
  },
];

export const INSTRUCTIONS =
  "Aya's onboarding records hold what the AI OS knows about each of Serge Abi's businesses, one field at a time. " +
  'Use get_gaps or get_business_record (status "open") to see what is missing, ask the owner, and save only what he ' +
  'states or confirms — never invent facts, prices or policies. Save answers as under_review; approve only when the ' +
  'owner explicitly asks. Customers see nothing until a fact is approved and the business is published from the ' +
  'console at https://ai.sergeabi.com, where the owner also decides when a record starts to drive its Company Brain.';
