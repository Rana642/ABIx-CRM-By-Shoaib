// Publishes an onboarding record's approved public facts to the agent's
// knowledge base: Qdrant collection clif_knowledge, embedded the same way the
// ingestion workflow does it (Ollama nomic-embed-text, 768 dimensions, cosine).
//
// Each publish replaces that business's earlier intake points and nothing else:
// they carry metadata.source = 'aya_intake' and the company code, so the
// knowledge base's own sections are never touched.
//
// Free of Next.js imports so it can be run on its own.

export type PublishableRow = {
  company_code: string;
  company_name: string;
  section_title: string;
  field_code: string;
  label: string;
  input_kind: 'text' | 'choice' | 'table';
  columns: string[] | null;
  value_text: string | null;
  value_rows: Record<string, string>[] | null;
};

// Record-keeping columns (stable IDs, cross-references, where a price was
// published) help the team, not a customer; they stay out of the agent's text.
const INTERNAL_COLUMN = /(^|\s)ID\b|policy references|Published source/;
const ID_COLUMN = /(^|\s)ID\b/;
const ID_TOKEN = /[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/g;

export type Chunk = { content: string; section: string; field_code: string | null };

export type PublishTarget = { qdrantUrl: string; ollamaUrl: string; collection: string };

export const INTAKE_SOURCE = 'aya_intake';
const EMBED_MODEL = 'nomic-embed-text';
const DIMENSIONS = 768;

// One chunk per section for the plain facts, and one per table row — so a
// question about one package or one price retrieves that row, not a wall of text.
export function buildChunks(rows: PublishableRow[], publishedOn: string): Chunk[] {
  const bySection = new Map<string, PublishableRow[]>();
  for (const r of rows) {
    if (!bySection.has(r.section_title)) bySection.set(r.section_title, []);
    bySection.get(r.section_title)!.push(r);
  }

  // Names for stable IDs, from any table whose first column is an ID and whose
  // second is a name (the offer catalog). A price row only references its offer
  // by ID, so without this its text would give an amount but not what it buys.
  const idName = new Map<string, string>();
  for (const t of rows) {
    const [idCol, nameCol] = t.columns ?? [];
    if (t.input_kind !== 'table' || !idCol || !nameCol || !ID_COLUMN.test(idCol) || !/name/i.test(nameCol)) continue;
    for (const row of t.value_rows ?? []) {
      const own = (row[idCol] ?? '').match(ID_TOKEN)?.[0];
      const name = row[nameCol]?.trim();
      if (own && name) idName.set(own, name);
    }
  }

  const chunks: Chunk[] = [];
  for (const [section, list] of Array.from(bySection.entries())) {
    const business = list[0].company_name;
    const topic = section.replace(/^\d+\s+—\s+/, '');

    const facts = list.filter((r) => r.input_kind !== 'table' && r.value_text?.trim());
    if (facts.length > 0) {
      chunks.push({
        section,
        field_code: null,
        content: [
          `${business} — approved facts: ${topic} (onboarding record, published ${publishedOn}).`,
          '',
          ...facts.map((r) => `${r.label}: ${r.value_text!.trim()}`),
        ].join('\n'),
      });
    }

    for (const t of list.filter((r) => r.input_kind === 'table')) {
      // Stored rows lose their key order, so follow the template's columns.
      const order = t.columns ?? [];
      for (const row of t.value_rows ?? []) {
        const keys = [...order, ...Object.keys(row).filter((k) => !order.includes(k))];
        // A retired offer or price is never offered to a customer.
        if (keys.some((k) => /status/i.test(k) && /\bretired\b/i.test(row[k] ?? ''))) continue;
        const cells = keys
          .filter((k) => !INTERNAL_COLUMN.test(k))
          .map((k) => [k, row[k]] as const)
          .filter(([, v]) => typeof v === 'string' && v.trim())
          .map(([k, v]) => `${k}: ${v!.trim()}`);
        if (cells.length === 0) continue;
        const shown = new Set(cells.map((c) => c.slice(c.indexOf(': ') + 2)));
        const refs = Array.from(
          new Set(keys.filter((k) => ID_COLUMN.test(k)).flatMap((k) => (row[k] ?? '').match(ID_TOKEN) ?? []))
        )
          .map((id) => idName.get(id))
          .filter((n): n is string => !!n && !shown.has(n));
        chunks.push({
          section,
          field_code: t.field_code,
          content: [
            `${business} — ${t.label} (approved, onboarding record, published ${publishedOn}).`,
            ...refs.map((n) => `For: ${n}`),
            ...cells,
          ].join('\n'),
        });
      }
    }
  }
  return chunks;
}

async function call(url: string, method: string, body: unknown): Promise<unknown> {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(/^https?:\/\/[^/]+/, '')} failed (HTTP ${r.status}): ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function embed(target: PublishTarget, texts: string[]): Promise<number[][]> {
  const j = (await call(`${target.ollamaUrl}/api/embed`, 'POST', { model: EMBED_MODEL, input: texts })) as {
    embeddings?: number[][];
  };
  const v = j?.embeddings;
  if (!Array.isArray(v) || v.length !== texts.length || v.some((e) => e.length !== DIMENSIONS)) {
    throw new Error('The embedding service returned an unexpected result; nothing was changed.');
  }
  return v;
}

// Embeds first, so a failure there leaves the knowledge base exactly as it was.
export async function publishChunks(
  target: PublishTarget,
  companyCode: string,
  chunks: Chunk[],
  publishedAt: string
): Promise<{ points: number }> {
  const vectors = chunks.length > 0 ? await embed(target, chunks.map((c) => c.content)) : [];
  const base = `${target.qdrantUrl}/collections/${target.collection}`;

  await call(`${base}/points/delete?wait=true`, 'POST', {
    filter: {
      must: [
        { key: 'metadata.source', match: { value: INTAKE_SOURCE } },
        { key: 'metadata.company_code', match: { value: companyCode } },
      ],
    },
  });

  if (chunks.length > 0) {
    await call(`${base}/points?wait=true`, 'PUT', {
      points: chunks.map((c, i) => ({
        id: crypto.randomUUID(),
        vector: vectors[i],
        payload: {
          content: c.content,
          metadata: {
            source: INTAKE_SOURCE,
            company_code: companyCode,
            section: c.section,
            field_code: c.field_code,
            published_at: publishedAt,
          },
        },
      })),
    });
  }
  return { points: chunks.length };
}
