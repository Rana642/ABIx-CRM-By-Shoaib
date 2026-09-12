'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../Shell';
import { Card } from '../ui';

// The business onboarding & update record — Serge's template v1.0, filled in
// here instead of in a document. The database enforces the rules (who approves,
// Not applicable needs a reason, approved facts keep their evidence); this
// screen only makes them easy to follow.

type Status = 'missing' | 'draft' | 'under_review' | 'approved' | 'not_applicable';
type Visibility = 'public' | 'internal' | 'restricted';
type Row = Record<string, string>;

type IntakeSection = {
  section_code: string;
  seq: number;
  title: string;
  kind: 'cover' | 'core' | 'supplement';
  guidance: string | null;
};

type IntakeField = {
  field_code: string;
  section_code: string;
  seq: number;
  label: string;
  hint: string | null;
  input_kind: 'text' | 'choice' | 'table';
  choices: string[] | null;
  columns: string[] | null;
  seed_rows: string[] | null;
  brain_module_code: string;
  module_name: string;
  default_visibility: Visibility;
  added_by_aya: boolean;
};

type Snapshot = {
  value_text: string | null;
  value_rows: Row[] | null;
  source_ref: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

type IntakeResponse = {
  field_code: string;
  value_text: string | null;
  value_rows: Row[] | null;
  status: Status;
  visibility: Visibility;
  source_ref: string | null;
  effective_date: string | null;
  review_date: string | null;
  note: string | null;
  blocking: boolean;
  gap_owner: string | null;
  gap_due: string | null;
  approved_snapshot: Snapshot | null;
  approved_by: string | null;
  approved_at: string | null;
  version: number;
  updated_by: string;
  updated_at: string;
};

type ModuleRollup = {
  module_code: string;
  module_name: string;
  readiness_weight: string | number;
  is_critical: boolean;
  fields_total: number;
  approved: number;
  under_review: number;
  draft: number;
  missing: number;
  not_applicable: number;
  derived_status: string;
  evidence_complete: boolean;
  gap_note: string | null;
  brain_status: string | null;
};

type Settings = {
  drives_brain: boolean;
  adopted_at: string | null;
  adopted_by: string | null;
  published_at?: string | null;
  published_by?: string | null;
  published_facts?: number | null;
};

type IntakeData = {
  sections: IntakeSection[];
  fields: IntakeField[];
  responses: IntakeResponse[];
  rollup: ModuleRollup[];
  preview: { current_score: string | null; projected_score: string | null } | null;
  settings: Settings;
  me: { username: string; display_name: string; can_approve: boolean } | null;
};

type HistoryEntry = {
  version: number;
  status: Status;
  value_text: string | null;
  value_rows: Row[] | null;
  source_ref: string | null;
  change_reason: string | null;
  applies_to: string | null;
  changed_by: string;
  changed_at: string;
};

const STATUS: Record<Status, { label: string; chip: string; bar: string }> = {
  approved: {
    label: 'Approved',
    chip: 'bg-secondary-container text-on-secondary-container',
    bar: 'bg-secondary',
  },
  under_review: {
    label: 'Under review',
    chip: 'bg-primary-fixed text-on-primary-fixed',
    bar: 'bg-primary',
  },
  draft: {
    label: 'Draft',
    chip: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    bar: 'bg-tertiary',
  },
  not_applicable: {
    label: 'Not applicable',
    chip: 'bg-surface-container text-outline',
    bar: 'bg-outline-variant',
  },
  missing: {
    label: 'Missing',
    chip: 'bg-surface-container-high text-on-surface-variant',
    bar: 'bg-surface-container-high',
  },
};
const STATUS_ORDER: Status[] = ['approved', 'under_review', 'draft', 'not_applicable', 'missing'];

const BRAIN_LABEL: Record<string, string> = {
  approved: 'Approved',
  in_review: 'In review',
  draft: 'Draft',
  missing: 'Missing',
  expired: 'Expired',
  conflicted: 'Conflicted',
  archived: 'Archived',
};

const VISIBILITY: Record<Visibility, string> = {
  public: 'Public — the agent may tell customers',
  internal: 'Internal — the team and Aya only',
  restricted: 'Restricted — named people only',
};

// The template's "Existing-business update form" reasons.
const CHANGE_REASONS = ['Price', 'Offer', 'Policy', 'SLA', 'Staff', 'System', 'Other'];
const APPLIES_TO = ['New customers only', 'Existing and new customers'];

const inputCls =
  'w-full rounded-lg bg-surface-container-lowest border border-outline-variant/50 px-space-12 py-space-8 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary';
const labelCls = 'font-label-sm text-label-sm text-outline uppercase tracking-wider';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function countStatuses(codes: string[], byField: Map<string, IntakeResponse>) {
  const c: Record<Status, number> = {
    approved: 0,
    under_review: 0,
    draft: 0,
    missing: 0,
    not_applicable: 0,
  };
  for (const code of codes) c[byField.get(code)?.status ?? 'missing']++;
  return c;
}

function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded font-semibold uppercase whitespace-nowrap ${STATUS[status].chip}`}
    >
      {STATUS[status].label}
    </span>
  );
}

function StatusBar({ counts, total }: { counts: Record<Status, number>; total: number }) {
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-surface-container-high">
      {STATUS_ORDER.filter((s) => s !== 'missing' && counts[s] > 0).map((s) => (
        <div key={s} className={STATUS[s].bar} style={{ width: `${(counts[s] / total) * 100}%` }} />
      ))}
    </div>
  );
}

function Legend({ counts }: { counts: Record<Status, number> }) {
  return (
    <div className="flex flex-wrap gap-x-space-16 gap-y-space-4">
      {STATUS_ORDER.map((s) => (
        <span key={s} className="flex items-center gap-space-4 font-label-sm text-label-sm text-on-surface-variant">
          <span
            className={`h-2 w-2 rounded-full ${
              s === 'missing' ? 'bg-surface-container-high ring-1 ring-outline-variant' : STATUS[s].bar
            }`}
          />
          <span className="tabular-nums font-semibold text-on-surface">{counts[s]}</span>
          {STATUS[s].label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}

export function Onboarding({
  companyId,
  companyName,
  onBrainChanged,
}: {
  companyId: string;
  companyName: string;
  onBrainChanged: () => void;
}) {
  const [data, setData] = useState<IntakeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'fill' | 'gaps' | 'brain' | 'agent'>('fill');
  const [sectionCode, setSectionCode] = useState('S00');
  const [filter, setFilter] = useState<'all' | 'todo' | 'review'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/intake?company_id=${companyId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setLoadError(null);
    } catch (e) {
      setLoadError(`The record could not be loaded (${(e as Error).message}). Reload the page to try again.`);
    }
  }, [companyId]);

  useEffect(() => {
    setData(null);
    setSectionCode('S00');
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!scrollTo || tab !== 'fill') return;
    const el = document.getElementById(`field-${scrollTo}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTo(null);
    }
  }, [scrollTo, tab, sectionCode, data]);

  const byField = useMemo(
    () => new Map((data?.responses ?? []).map((r) => [r.field_code, r])),
    [data]
  );
  const fieldsBySection = useMemo(() => {
    const m = new Map<string, IntakeField[]>();
    for (const f of data?.fields ?? []) {
      if (!m.has(f.section_code)) m.set(f.section_code, []);
      m.get(f.section_code)!.push(f);
    }
    return m;
  }, [data]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false as const, error: (j.error as string) ?? `Not saved (HTTP ${r.status}).` };
    return { ok: true as const, data: j };
  }

  async function saveField(payload: Record<string, unknown>): Promise<string | null> {
    const res = await post(payload);
    if (!res.ok) return res.error;
    await load();
    if (data?.settings.drives_brain) onBrainChanged();
    const done: Record<string, string> = {
      draft: 'Saved as draft',
      under_review: 'Sent for review',
      approved: 'Approved',
      not_applicable: 'Marked not applicable',
      missing: 'Saved',
    };
    setToast(done[String(payload.status)] ?? 'Saved');
    return null;
  }

  if (loadError) {
    return (
      <Card className="max-w-3xl border border-error-container">
        <p className="font-body-md text-body-md text-on-surface">{loadError}</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card className="max-w-3xl">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading the onboarding record…</p>
      </Card>
    );
  }

  const allCodes = data.fields.map((f) => f.field_code);
  const totals = countStatuses(allCodes, byField);
  const me = data.me;
  const canApprove = !!me?.can_approve;
  const gaps = data.fields.filter((f) => {
    const r = byField.get(f.field_code);
    return r?.blocking || ((r?.status === 'missing' || r?.status === 'draft') && !!r?.note);
  });
  const publishable = data.fields.filter((f) => {
    const r = byField.get(f.field_code);
    return r?.approved_snapshot && r.visibility === 'public';
  });

  function openField(code: string) {
    const f = data!.fields.find((x) => x.field_code === code);
    if (!f) return;
    setFilter('all');
    setSectionCode(f.section_code);
    setTab('fill');
    setScrollTo(code);
  }

  return (
    <div className="flex flex-col w-full gap-space-24">
      <RecordHeader
        companyName={companyName}
        data={data}
        totals={totals}
        total={allCodes.length}
        onAdopt={async () => {
          const res = await post({ action: 'adopt' });
          if (!res.ok) return res.error;
          await load();
          onBrainChanged();
          setToast('The Brain now follows this record');
          return null;
        }}
      />

      <div className="flex flex-wrap gap-space-8" role="tablist" aria-label="Onboarding record views">
        {(
          [
            ['fill', 'Fill in', 'edit_note', null],
            ['gaps', 'Gaps & decisions', 'flag', gaps.length],
            ['brain', 'Brain modules', 'neurology', null],
            ['agent', 'What the agent knows', 'record_voice_over', publishable.length],
          ] as const
        ).map(([key, label, icon, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-space-8 px-space-16 py-space-8 rounded-lg font-body-sm text-body-sm transition-colors ${
              tab === key
                ? 'bg-primary-container text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            <Icon name={icon} className="text-[18px]" />
            {label}
            {count !== null && <span className="tabular-nums opacity-70">{count}</span>}
          </button>
        ))}
      </div>

      {tab === 'fill' && (
        <div className="grid grid-cols-1 lg:grid-cols-[288px_minmax(0,1fr)] gap-space-24 items-start">
          <SectionNav
            sections={data.sections}
            fieldsBySection={fieldsBySection}
            byField={byField}
            active={sectionCode}
            onSelect={(c) => setSectionCode(c)}
          />
          <SectionPanel
            key={`${companyId}:${sectionCode}`}
            section={data.sections.find((s) => s.section_code === sectionCode) ?? data.sections[0]}
            fields={fieldsBySection.get(sectionCode) ?? []}
            byField={byField}
            filter={filter}
            onFilter={setFilter}
            companyId={companyId}
            canApprove={canApprove}
            onSave={saveField}
            onMarkSection={async (note) => {
              const res = await post({ action: 'mark_section', section_code: sectionCode, note });
              if (!res.ok) return res.error;
              await load();
              if (data.settings.drives_brain) onBrainChanged();
              setToast(`${res.data.marked} fields marked not applicable`);
              return null;
            }}
          />
        </div>
      )}

      {tab === 'gaps' && (
        <GapRegister fields={data.fields} gaps={gaps} byField={byField} sections={data.sections} onOpen={openField} />
      )}

      {tab === 'brain' && <BrainModules rollup={data.rollup} drivesBrain={data.settings.drives_brain} />}

      {tab === 'agent' && (
        <AgentKnowledge
          fields={publishable}
          byField={byField}
          sections={data.sections}
          settings={data.settings}
          canPublish={canApprove}
          onPublish={async () => {
            const res = await post({ action: 'publish' });
            if (!res.ok) return res.error;
            await load();
            setToast(`Published ${res.data.facts} facts to the agent`);
            return null;
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-space-24 right-space-24 z-50 flex items-center gap-space-8 px-space-16 py-space-12 rounded-lg bg-inverse-surface text-inverse-on-surface shadow-lg font-body-sm text-body-sm"
        >
          <Icon name="check_circle" className="text-[18px]" />
          {toast}
        </div>
      )}
    </div>
  );
}

function RecordHeader({
  companyName,
  data,
  totals,
  total,
  onAdopt,
}: {
  companyName: string;
  data: IntakeData;
  totals: Record<Status, number>;
  total: number;
  onAdopt: () => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = data.preview?.current_score !== null && data.preview?.current_score !== undefined
    ? Number(data.preview.current_score)
    : null;
  const projected = data.preview?.projected_score ? Number(data.preview.projected_score) : null;
  const s = data.settings;

  return (
    <Card className="flex flex-col xl:flex-row gap-space-24 xl:items-start justify-between">
      <div className="flex flex-col gap-space-12 min-w-0 flex-1">
        <div>
          <span className={labelCls}>Onboarding record · template v1.0</span>
          <h1 className="font-headline-md text-headline-md text-primary truncate">{companyName}</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-4 max-w-[72ch]">
            Everything Aya needs to know about this business, one field at a time. Each field feeds one Company
            Brain module; approved public facts can be published to the customer-facing agent, everything else
            stays internal.
          </p>
        </div>
        <div className="flex flex-col gap-space-8 max-w-2xl">
          <StatusBar counts={totals} total={total} />
          <Legend counts={totals} />
        </div>
        {data.me && (
          <span className="font-label-sm text-label-sm text-outline">
            Signed in as {data.me.display_name}
            {data.me.can_approve ? ' — you approve facts for this business' : ' — you prepare; Serge approves'}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-space-12 xl:w-[340px] shrink-0 bg-surface-container-low rounded-lg p-space-16">
        <span className={labelCls}>Company Brain readiness</span>
        <div className="flex items-end gap-space-16">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline">Now</span>
            <span className="font-tabular-metric text-tabular-metric text-primary font-bold tabular-nums">
              {now === null ? '—' : `${now}%`}
            </span>
          </div>
          {!s.drives_brain && (
            <>
              <Icon name="arrow_forward" className="text-outline text-[20px] mb-space-8" />
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-outline">From this record</span>
                <span className="font-tabular-metric text-tabular-metric text-secondary font-bold tabular-nums">
                  {projected === null ? '—' : `${projected}%`}
                </span>
              </div>
            </>
          )}
        </div>
        {s.drives_brain ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            The Brain follows this record since {formatDate(s.adopted_at)}. Every approval updates it straight away.
          </p>
        ) : data.me?.can_approve ? (
          confirming ? (
            <div className="flex flex-col gap-space-8">
              <p className="font-body-sm text-body-sm text-on-surface">
                Readiness moves from {now ?? 0}% to {projected ?? 0}%, because the Brain will count only what this
                record holds, field by field. Later approvals update it automatically.
              </p>
              {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
              <div className="flex gap-space-8">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const err = await onAdopt();
                    setBusy(false);
                    if (err) setError(err);
                    else setConfirming(false);
                  }}
                  className="px-space-12 py-space-8 rounded-lg bg-secondary text-on-secondary font-body-sm text-body-sm font-semibold disabled:opacity-60"
                >
                  {busy ? 'Switching…' : 'Switch the Brain over'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="px-space-12 py-space-8 rounded-lg text-on-surface-variant hover:bg-surface-container-high font-body-sm text-body-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Review the prefilled answers, then let this record drive the Brain.
              </p>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="self-start px-space-12 py-space-8 rounded-lg bg-primary-container text-on-primary font-body-sm text-body-sm font-semibold"
              >
                Use this record for the Brain
              </button>
            </>
          )
        ) : (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Serge switches the Brain to this record once he has reviewed the prefilled answers.
          </p>
        )}
      </div>
    </Card>
  );
}

function SectionNav({
  sections,
  fieldsBySection,
  byField,
  active,
  onSelect,
}: {
  sections: IntakeSection[];
  fieldsBySection: Map<string, IntakeField[]>;
  byField: Map<string, IntakeResponse>;
  active: string;
  onSelect: (code: string) => void;
}) {
  const groups: [string, IntakeSection[]][] = [
    ['Start here', sections.filter((s) => s.kind === 'cover')],
    ['Modules', sections.filter((s) => s.kind === 'core' && s.section_code !== 'EVD')],
    ['Evidence', sections.filter((s) => s.section_code === 'EVD')],
    ['Supplements', sections.filter((s) => s.kind === 'supplement')],
  ];

  return (
    <>
      <div className="lg:hidden">
        <label htmlFor="intake-section" className={labelCls}>
          Section
        </label>
        <select
          id="intake-section"
          value={active}
          onChange={(e) => onSelect(e.target.value)}
          className={`${inputCls} mt-space-4`}
        >
          {sections.map((s) => (
            <option key={s.section_code} value={s.section_code}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      <Card padded={false} className="hidden lg:block lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
        <nav className="p-space-8 flex flex-col gap-space-12" aria-label="Record sections">
          {groups.map(([name, list]) =>
            list.length === 0 ? null : (
              <div key={name} className="flex flex-col gap-space-2">
                <span className={`${labelCls} px-space-8 pt-space-8`}>{name}</span>
                {list.map((s) => {
                  const codes = (fieldsBySection.get(s.section_code) ?? []).map((f) => f.field_code);
                  const c = countStatuses(codes, byField);
                  const done = c.approved + c.not_applicable;
                  const isActive = s.section_code === active;
                  return (
                    <button
                      key={s.section_code}
                      type="button"
                      onClick={() => onSelect(s.section_code)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`w-full text-left px-space-8 py-space-8 rounded-lg flex flex-col gap-space-4 transition-colors ${
                        isActive ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-space-8">
                        <span
                          className={`font-body-sm text-body-sm leading-snug ${
                            isActive ? 'text-on-surface font-semibold' : 'text-on-surface-variant'
                          }`}
                        >
                          {s.title}
                        </span>
                        <span className="font-label-sm text-label-sm text-outline tabular-nums shrink-0">
                          {done}/{codes.length}
                        </span>
                      </span>
                      <StatusBar counts={c} total={codes.length || 1} />
                    </button>
                  );
                })}
              </div>
            )
          )}
        </nav>
      </Card>
    </>
  );
}

function SectionPanel({
  section,
  fields,
  byField,
  filter,
  onFilter,
  companyId,
  canApprove,
  onSave,
  onMarkSection,
}: {
  section: IntakeSection;
  fields: IntakeField[];
  byField: Map<string, IntakeResponse>;
  filter: 'all' | 'todo' | 'review';
  onFilter: (f: 'all' | 'todo' | 'review') => void;
  companyId: string;
  canApprove: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<string | null>;
  onMarkSection: (note: string) => Promise<string | null>;
}) {
  const [naNote, setNaNote] = useState('');
  const [naOpen, setNaOpen] = useState(false);
  const [naError, setNaError] = useState<string | null>(null);

  const modules = Array.from(new Map(fields.map((f) => [f.brain_module_code, f.module_name])).entries());
  const shown = fields.filter((f) => {
    const st = byField.get(f.field_code)?.status ?? 'missing';
    if (filter === 'todo') return st === 'missing' || st === 'draft';
    if (filter === 'review') return st === 'under_review';
    return true;
  });
  const missingCount = fields.filter((f) => (byField.get(f.field_code)?.status ?? 'missing') === 'missing').length;

  return (
    <div className="flex flex-col gap-space-16 min-w-0">
      <Card className="flex flex-col gap-space-12">
        <div className="flex flex-wrap items-start justify-between gap-space-12">
          <h2 className="font-headline-sm text-headline-sm text-primary">{section.title}</h2>
          <div className="flex gap-space-4" role="group" aria-label="Show fields">
            {(
              [
                ['all', 'All'],
                ['todo', 'To fill in'],
                ['review', 'Awaiting approval'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => onFilter(k)}
                aria-pressed={filter === k}
                className={`px-space-12 py-space-4 rounded-full font-label-sm text-label-sm transition-colors ${
                  filter === k
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {section.guidance && (
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[80ch]">{section.guidance}</p>
        )}
        <div className="flex flex-wrap items-center gap-space-8">
          <span className={labelCls}>Feeds</span>
          {modules.map(([code, name]) => (
            <span
              key={code}
              className="font-label-sm text-label-sm px-space-8 py-0.5 rounded bg-surface-container text-on-surface-variant"
              title={code}
            >
              {code.slice(0, 4)} · {name}
            </span>
          ))}
        </div>
        {section.kind === 'supplement' && missingCount > 0 && (
          <div className="border-t border-outline-variant/30 pt-space-12">
            {naOpen ? (
              <div className="flex flex-col gap-space-8 max-w-xl">
                <label htmlFor="section-na-reason" className="font-body-sm text-body-sm text-on-surface">
                  Why does this supplement not apply to this business?
                </label>
                <input
                  id="section-na-reason"
                  value={naNote}
                  onChange={(e) => setNaNote(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. We sell services only — no physical products."
                />
                {naError && <p className="font-body-sm text-body-sm text-error">{naError}</p>}
                <div className="flex gap-space-8">
                  <button
                    type="button"
                    onClick={async () => {
                      const err = await onMarkSection(naNote);
                      if (err) setNaError(err);
                      else {
                        setNaOpen(false);
                        setNaNote('');
                      }
                    }}
                    className="px-space-12 py-space-8 rounded-lg bg-primary-container text-on-primary font-body-sm text-body-sm font-semibold"
                  >
                    Mark {missingCount} fields not applicable
                  </button>
                  <button
                    type="button"
                    onClick={() => setNaOpen(false)}
                    className="px-space-12 py-space-8 rounded-lg text-on-surface-variant hover:bg-surface-container-high font-body-sm text-body-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNaOpen(true)}
                className="font-body-sm text-body-sm text-secondary font-semibold hover:underline"
              >
                This supplement does not apply to this business
              </button>
            )}
          </div>
        )}
      </Card>

      {shown.length === 0 && (
        <Card>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Nothing in this section matches the filter.</p>
        </Card>
      )}

      {shown.map((f) => {
        const r = byField.get(f.field_code);
        return (
          <FieldEditor
            key={`${f.field_code}:${r?.version ?? 0}`}
            field={f}
            response={r}
            companyId={companyId}
            canApprove={canApprove}
            onSave={onSave}
          />
        );
      })}
    </div>
  );
}

type Draft = {
  value_text: string;
  value_rows: Row[];
  visibility: Visibility;
  source_ref: string;
  effective_date: string;
  review_date: string;
  note: string;
  blocking: boolean;
  gap_owner: string;
  gap_due: string;
};

function draftOf(f: IntakeField, r?: IntakeResponse): Draft {
  return {
    value_text: r?.value_text ?? '',
    value_rows: r?.value_rows ?? [],
    visibility: r?.visibility ?? f.default_visibility,
    source_ref: r?.source_ref ?? '',
    effective_date: r?.effective_date ?? '',
    review_date: r?.review_date ?? '',
    note: r?.note ?? '',
    blocking: r?.blocking ?? false,
    gap_owner: r?.gap_owner ?? '',
    gap_due: r?.gap_due ?? '',
  };
}

function FieldEditor({
  field,
  response,
  companyId,
  canApprove,
  onSave,
}: {
  field: IntakeField;
  response?: IntakeResponse;
  companyId: string;
  canApprove: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<string | null>;
}) {
  const initial = useMemo(() => draftOf(field, response), [field, response]);
  const [d, setD] = useState<Draft>(initial);
  const [changeReason, setChangeReason] = useState('');
  const [appliesTo, setAppliesTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(
    !!(initial.effective_date || initial.review_date || initial.gap_owner || initial.gap_due || initial.blocking)
  );
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const status: Status = response?.status ?? 'missing';
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const editingApproved = status === 'approved' && dirty;
  const hasValue =
    field.input_kind === 'table'
      ? d.value_rows.some((row) => Object.values(row).some((v) => v.trim()))
      : d.value_text.trim().length > 0;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function submit(next: Status) {
    setError(null);
    if (next === 'not_applicable' && !d.note.trim()) {
      setError('Write in the note why this does not apply, then mark it not applicable.');
      return;
    }
    setBusy(true);
    const err = await onSave({
      field_code: field.field_code,
      status: next,
      value_text: field.input_kind === 'table' ? null : d.value_text,
      value_rows: field.input_kind === 'table' ? d.value_rows : null,
      visibility: d.visibility,
      source_ref: d.source_ref,
      effective_date: d.effective_date,
      review_date: d.review_date,
      note: d.note,
      blocking: d.blocking,
      gap_owner: d.gap_owner,
      gap_due: d.gap_due,
      change_reason: changeReason,
      applies_to: appliesTo,
    });
    setBusy(false);
    if (err) setError(err);
  }

  async function loadHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    const r = await fetch(`/api/intake?company_id=${companyId}&history=${encodeURIComponent(field.field_code)}`);
    const j = await r.json().catch(() => ({ history: [] }));
    setHistory(j.history ?? []);
  }

  const snapshot = response?.approved_snapshot;
  const showApprovedCopy = !!snapshot && status !== 'approved';
  const idBase = `f-${field.field_code.replace(/\./g, '-')}`;

  return (
    <Card className="flex flex-col gap-space-12 scroll-mt-24" >
      <div id={`field-${field.field_code}`} className="flex flex-wrap items-start justify-between gap-space-8">
        <div className="flex flex-col gap-space-4 min-w-0 max-w-[80ch]">
          <label htmlFor={`${idBase}-value`} className="font-body-md text-body-md font-semibold text-on-surface">
            {field.label}
          </label>
          {field.hint && <p className="font-body-sm text-body-sm text-on-surface-variant">{field.hint}</p>}
        </div>
        <div className="flex items-center gap-space-8 shrink-0">
          {field.added_by_aya && (
            <span
              className="font-label-sm text-label-sm px-space-8 py-0.5 rounded bg-surface-container text-secondary font-semibold"
              title="Not in the template: added because the Brain module needs this evidence"
            >
              Added by Aya
            </span>
          )}
          <span
            className="font-label-sm text-label-sm text-outline tabular-nums"
            title={`${field.brain_module_code} — ${field.module_name}`}
          >
            {field.brain_module_code.slice(0, 4)}
          </span>
          <StatusChip status={status} />
        </div>
      </div>

      {field.input_kind === 'choice' && (
        <select
          id={`${idBase}-value`}
          value={d.value_text}
          onChange={(e) => set('value_text', e.target.value)}
          className={`${inputCls} max-w-sm`}
        >
          <option value="">Choose…</option>
          {(field.choices ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {field.input_kind === 'text' && (
        <textarea
          id={`${idBase}-value`}
          value={d.value_text}
          onChange={(e) => set('value_text', e.target.value)}
          rows={Math.min(10, Math.max(2, Math.ceil(d.value_text.length / 110) + (d.value_text.match(/\n/g)?.length ?? 0)))}
          className={inputCls}
          placeholder="Not recorded yet"
        />
      )}

      {field.input_kind === 'table' && (
        <TableEditor
          idBase={idBase}
          columns={field.columns ?? []}
          seedRows={field.seed_rows}
          rows={d.value_rows}
          onChange={(rows) => set('value_rows', rows)}
        />
      )}

      {showApprovedCopy && snapshot && (
        <div className="rounded-lg bg-surface-container-low px-space-12 py-space-8 font-body-sm text-body-sm text-on-surface-variant">
          <span className="font-semibold text-on-surface">Customers still see the approved version</span> from{' '}
          {formatDate(snapshot.approved_at)}
          {snapshot.value_text ? `: “${snapshot.value_text}”` : snapshot.value_rows ? ` (${snapshot.value_rows.length} rows)` : ''}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-space-12">
        <div className="flex flex-col gap-space-4">
          <label htmlFor={`${idBase}-vis`} className={labelCls}>
            Who may see it
          </label>
          <select
            id={`${idBase}-vis`}
            value={d.visibility}
            onChange={(e) => set('visibility', e.target.value as Visibility)}
            className={inputCls}
          >
            {(Object.keys(VISIBILITY) as Visibility[]).map((v) => (
              <option key={v} value={v}>
                {VISIBILITY[v]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-space-4">
          <label htmlFor={`${idBase}-src`} className={labelCls}>
            Evidence / source
          </label>
          <input
            id={`${idBase}-src`}
            value={d.source_ref}
            onChange={(e) => set('source_ref', e.target.value)}
            className={inputCls}
            placeholder="Link, document or who confirmed it — your approval counts if left empty"
          />
        </div>
      </div>

      <div className="flex flex-col gap-space-4">
        <label htmlFor={`${idBase}-note`} className={labelCls}>
          Note — what is missing, a conflict, or why it does not apply
        </label>
        <textarea
          id={`${idBase}-note`}
          value={d.note}
          onChange={(e) => set('note', e.target.value)}
          rows={d.note.length > 120 ? 3 : 2}
          className={inputCls}
        />
      </div>

      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        aria-expanded={details}
        className="self-start flex items-center gap-space-4 font-label-sm text-label-sm text-outline hover:text-on-surface"
      >
        <Icon name={details ? 'expand_less' : 'expand_more'} className="text-[16px]" />
        Dates, owner and blocking
      </button>
      {details && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-12">
          {(
            [
              ['effective_date', 'Effective from', 'date'],
              ['review_date', 'Next review', 'date'],
              ['gap_owner', 'Who fills the gap', 'text'],
              ['gap_due', 'Gap due by', 'date'],
            ] as const
          ).map(([k, l, type]) => (
            <div key={k} className="flex flex-col gap-space-4">
              <label htmlFor={`${idBase}-${k}`} className={labelCls}>
                {l}
              </label>
              <input
                id={`${idBase}-${k}`}
                type={type}
                value={d[k]}
                onChange={(e) => set(k, e.target.value)}
                className={inputCls}
              />
            </div>
          ))}
          <label className="flex items-center gap-space-8 font-body-sm text-body-sm text-on-surface sm:col-span-2 xl:col-span-4">
            <input
              type="checkbox"
              checked={d.blocking}
              onChange={(e) => set('blocking', e.target.checked)}
              className="h-4 w-4 accent-[rgb(var(--c-secondary))]"
            />
            This gap blocks a workflow from going live
          </label>
        </div>
      )}

      {editingApproved && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-12 rounded-lg border border-outline-variant/40 p-space-12">
          <p className="sm:col-span-2 font-body-sm text-body-sm text-on-surface-variant">
            You are changing an approved fact. Customers keep the approved version until the change is approved.
          </p>
          <div className="flex flex-col gap-space-4">
            <label htmlFor={`${idBase}-reason`} className={labelCls}>
              Reason for the change
            </label>
            <select
              id={`${idBase}-reason`}
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              className={inputCls}
            >
              <option value="">Choose…</option>
              {CHANGE_REASONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-space-4">
            <label htmlFor={`${idBase}-applies`} className={labelCls}>
              Applies to
            </label>
            <select
              id={`${idBase}-applies`}
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value)}
              className={inputCls}
            >
              <option value="">Choose…</option>
              {APPLIES_TO.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-space-8 pt-space-4 border-t border-outline-variant/20">
        <div className="flex flex-wrap items-center gap-space-8 font-label-sm text-label-sm text-outline">
          {status === 'approved' && response?.approved_by && (
            <span>
              Approved by {response.approved_by}, {formatDate(response.approved_at)}
            </span>
          )}
          {response && (
            <button type="button" onClick={loadHistory} className="hover:text-on-surface underline-offset-2 hover:underline">
              {history ? 'Hide history' : `History · v${response.version}`}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-space-8">
          {(dirty || status !== 'approved') && (
            <>
              <ActionButton busy={busy} disabled={!hasValue} onClick={() => submit('draft')} tone="plain">
                Save draft
              </ActionButton>
              <ActionButton busy={busy} disabled={!hasValue} onClick={() => submit('under_review')} tone="plain">
                Send for review
              </ActionButton>
              {canApprove && (
                <ActionButton busy={busy} disabled={!hasValue} onClick={() => submit('approved')} tone="primary">
                  Approve
                </ActionButton>
              )}
            </>
          )}
          {status !== 'not_applicable' && (
            <ActionButton busy={busy} onClick={() => submit('not_applicable')} tone="quiet">
              Not applicable
            </ActionButton>
          )}
        </div>
      </div>

      {history && (
        <ol className="flex flex-col gap-space-8 border-t border-outline-variant/20 pt-space-12">
          {history.map((h) => (
            <li key={h.version} className="flex flex-col gap-space-2 font-body-sm text-body-sm">
              <span className="flex flex-wrap items-center gap-space-8">
                <span className="font-label-sm text-label-sm text-outline tabular-nums">v{h.version}</span>
                <StatusChip status={h.status} />
                <span className="text-on-surface-variant">
                  {h.changed_by} · {formatDate(h.changed_at)}
                  {h.change_reason ? ` · ${h.change_reason}` : ''}
                  {h.applies_to ? ` · ${h.applies_to}` : ''}
                </span>
              </span>
              <span className="text-on-surface-variant line-clamp-2">
                {h.value_text ?? (h.value_rows ? `${h.value_rows.length} rows` : '—')}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ActionButton({
  children,
  onClick,
  busy,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  tone: 'primary' | 'plain' | 'quiet';
}) {
  const cls = {
    primary: 'bg-secondary text-on-secondary font-semibold',
    plain: 'bg-surface-container-high text-on-surface font-medium hover:bg-surface-container-highest',
    quiet: 'text-on-surface-variant hover:bg-surface-container-high',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={`px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  );
}

function TableEditor({
  idBase,
  columns,
  seedRows,
  rows,
  onChange,
}: {
  idBase: string;
  columns: string[];
  seedRows: string[] | null;
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  const blank = (): Row => Object.fromEntries(columns.map((c) => [c, '']));
  const update = (i: number, col: string, v: string) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [col]: v } : r)));

  return (
    <div className="flex flex-col gap-space-12">
      {rows.length === 0 && (
        <p id={`${idBase}-value`} className="font-body-sm text-body-sm text-outline">
          No rows yet.
        </p>
      )}
      {rows.map((row, i) => (
        <fieldset key={i} className="rounded-lg border border-outline-variant/40 p-space-12 flex flex-col gap-space-8">
          <legend className="px-space-4 font-label-sm text-label-sm text-on-surface-variant font-semibold">
            {row[columns[0]]?.trim() || `Row ${i + 1}`}
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-8">
            {columns.map((col, ci) => (
              <div key={col} className="flex flex-col gap-space-2">
                <label htmlFor={`${idBase}-r${i}-c${ci}`} className="font-label-sm text-label-sm text-outline">
                  {col}
                </label>
                <textarea
                  id={i === 0 && ci === 0 ? `${idBase}-value` : `${idBase}-r${i}-c${ci}`}
                  value={row[col] ?? ''}
                  onChange={(e) => update(i, col, e.target.value)}
                  rows={(row[col] ?? '').length > 70 ? 3 : 1}
                  className={`${inputCls} resize-y`}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="self-end font-label-sm text-label-sm text-outline hover:text-error"
          >
            Remove this row
          </button>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-space-8">
        <button
          type="button"
          onClick={() => onChange([...rows, blank()])}
          className="flex items-center gap-space-4 px-space-12 py-space-8 rounded-lg bg-surface-container text-on-surface font-body-sm text-body-sm hover:bg-surface-container-high"
        >
          <Icon name="add" className="text-[18px]" />
          Add a row
        </button>
        {rows.length === 0 && seedRows && seedRows.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(seedRows.map((s) => ({ ...blank(), [columns[0]]: s })))}
            className="px-space-12 py-space-8 rounded-lg text-secondary font-body-sm text-body-sm font-semibold hover:bg-surface-container"
          >
            Start from the template&apos;s {seedRows.length} rows
          </button>
        )}
      </div>
    </div>
  );
}

function GapRegister({
  fields,
  gaps,
  byField,
  sections,
  onOpen,
}: {
  fields: IntakeField[];
  gaps: IntakeField[];
  byField: Map<string, IntakeResponse>;
  sections: IntakeSection[];
  onOpen: (code: string) => void;
}) {
  const [scope, setScope] = useState<'decisions' | 'blocking' | 'all'>('decisions');
  const title = new Map(sections.map((s) => [s.section_code, s.title]));
  const open = fields.filter((f) => {
    const st = byField.get(f.field_code)?.status ?? 'missing';
    return st === 'missing' || st === 'draft';
  });
  const list = (scope === 'blocking' ? gaps.filter((f) => byField.get(f.field_code)?.blocking) : scope === 'all' ? open : gaps)
    .slice()
    .sort((a, b) => Number(!!byField.get(b.field_code)?.blocking) - Number(!!byField.get(a.field_code)?.blocking));

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-space-20 py-space-16 border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-space-12">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-primary">Gap and decision register</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2 max-w-[70ch]">
            What is still missing or needs a decision. Open any line to fill it in.
          </p>
        </div>
        <div className="flex gap-space-4" role="group" aria-label="Show gaps">
          {(
            [
              ['decisions', `Named gaps · ${gaps.length}`],
              ['blocking', `Blocking · ${gaps.filter((f) => byField.get(f.field_code)?.blocking).length}`],
              ['all', `Everything open · ${open.length}`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={scope === k}
              onClick={() => setScope(k)}
              className={`px-space-12 py-space-4 rounded-full font-label-sm text-label-sm tabular-nums ${
                scope === k
                  ? 'bg-primary-container text-on-primary font-semibold'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-body-sm text-body-sm">
          <thead>
            <tr className="bg-surface-container-low text-left">
              {['Field', 'What is missing / conflict', 'Brain module', 'Blocking', 'Owner', 'Due', 'Status'].map((h) => (
                <th key={h} className="px-space-16 py-space-8 font-label-sm text-label-sm text-outline uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((f) => {
              const r = byField.get(f.field_code);
              return (
                <tr key={f.field_code} className="border-t border-outline-variant/20 align-top">
                  <td className="px-space-16 py-space-12 min-w-[220px]">
                    <button type="button" onClick={() => onOpen(f.field_code)} className="text-left group">
                      <span className="block font-semibold text-on-surface group-hover:underline">{f.label}</span>
                      <span className="block font-label-sm text-label-sm text-outline">{title.get(f.section_code)}</span>
                    </button>
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant min-w-[260px] max-w-[48ch]">
                    {r?.note ?? <span className="text-outline">—</span>}
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant whitespace-nowrap" title={f.module_name}>
                    {f.brain_module_code.slice(0, 4)} · {f.module_name}
                  </td>
                  <td className="px-space-16 py-space-12">
                    {r?.blocking ? (
                      <span className="font-label-sm text-label-sm px-space-8 py-0.5 rounded bg-error-container text-on-error-container font-semibold uppercase">
                        Blocking
                      </span>
                    ) : (
                      <span className="text-outline">—</span>
                    )}
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant whitespace-nowrap">
                    {r?.gap_owner ?? <span className="text-outline">—</span>}
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant whitespace-nowrap tabular-nums">
                    {r?.gap_due ? formatDate(r.gap_due) : <span className="text-outline">—</span>}
                  </td>
                  <td className="px-space-16 py-space-12">
                    <StatusChip status={r?.status ?? 'missing'} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length === 0 && (
        <p className="px-space-20 py-space-16 font-body-sm text-body-sm text-on-surface-variant">Nothing here.</p>
      )}
    </Card>
  );
}

function BrainModules({ rollup, drivesBrain }: { rollup: ModuleRollup[]; drivesBrain: boolean }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-space-20 py-space-16 border-b border-outline-variant/20">
        <h2 className="font-headline-sm text-headline-sm text-primary">How this record feeds the Company Brain</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2 max-w-[80ch]">
          No new weights, as the template asks: each field belongs to one of the twenty Brain modules. A module is
          approved when all its fields are approved or not applicable, in review when the rest await approval, and
          draft while anything is still being filled in.
          {drivesBrain ? ' The Brain follows this record.' : ' The Brain does not follow this record yet.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-body-sm text-body-sm">
          <thead>
            <tr className="bg-surface-container-low text-left">
              {['Module', 'Weight', 'Fields', 'Brain now', 'From this record', 'Still to fill in'].map((h) => (
                <th key={h} className="px-space-16 py-space-8 font-label-sm text-label-sm text-outline uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rollup.map((m) => {
              const counts: Record<Status, number> = {
                approved: m.approved,
                under_review: m.under_review,
                draft: m.draft,
                missing: m.missing,
                not_applicable: m.not_applicable,
              };
              return (
                <tr key={m.module_code} className="border-t border-outline-variant/20 align-top">
                  <td className="px-space-16 py-space-12 min-w-[220px]">
                    <span className="block font-semibold text-on-surface">{m.module_name}</span>
                    <span className="block font-label-sm text-label-sm text-outline">
                      {m.module_code}
                      {m.is_critical ? ' · critical' : ''}
                    </span>
                  </td>
                  <td className="px-space-16 py-space-12 tabular-nums text-on-surface-variant">
                    {Number(m.readiness_weight).toFixed(0)}
                  </td>
                  <td className="px-space-16 py-space-12 min-w-[160px]">
                    <StatusBar counts={counts} total={m.fields_total} />
                    <span className="block mt-space-4 font-label-sm text-label-sm text-outline tabular-nums">
                      {m.approved + m.not_applicable}/{m.fields_total} done
                    </span>
                  </td>
                  <td className="px-space-16 py-space-12 whitespace-nowrap text-on-surface-variant">
                    {m.brain_status ? BRAIN_LABEL[m.brain_status] ?? m.brain_status : 'No Brain yet'}
                  </td>
                  <td className="px-space-16 py-space-12 whitespace-nowrap font-semibold text-on-surface">
                    {BRAIN_LABEL[m.derived_status] ?? m.derived_status}
                  </td>
                  <td className="px-space-16 py-space-12 text-on-surface-variant min-w-[260px] max-w-[52ch]">
                    {m.gap_note ?? <span className="text-outline">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AgentKnowledge({
  fields,
  byField,
  sections,
  settings,
  canPublish,
  onPublish,
}: {
  fields: IntakeField[];
  byField: Map<string, IntakeResponse>;
  sections: IntakeSection[];
  settings: Settings;
  canPublish: boolean;
  onPublish: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grouped = sections
    .map((s) => ({ s, list: fields.filter((f) => f.section_code === s.section_code) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="flex flex-col gap-space-16">
      <Card className="flex flex-col md:flex-row md:items-center justify-between gap-space-16">
        <div className="max-w-[72ch]">
          <h2 className="font-headline-sm text-headline-sm text-primary">What the agent may tell customers</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2">
            Only facts that are approved and marked Public. Publishing puts the approved version into the
            agent&apos;s knowledge base; a change waiting for approval is never published.
          </p>
          <p className="font-label-sm text-label-sm text-outline mt-space-8">
            {settings.published_at
              ? `Last published ${formatDate(settings.published_at)} by ${settings.published_by} — ${settings.published_facts} facts`
              : 'Not published yet'}
          </p>
          {error && <p className="font-body-sm text-body-sm text-error mt-space-8">{error}</p>}
        </div>
        {canPublish ? (
          <button
            type="button"
            disabled={busy || fields.length === 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const err = await onPublish();
              setBusy(false);
              if (err) setError(err);
            }}
            className="shrink-0 flex items-center gap-space-8 px-space-16 py-space-8 rounded-lg bg-secondary text-on-secondary font-body-sm text-body-sm font-semibold disabled:opacity-50"
          >
            <Icon name="publish" className="text-[18px]" />
            {busy ? 'Publishing…' : `Publish ${fields.length} facts to the agent`}
          </button>
        ) : (
          <span className="font-body-sm text-body-sm text-on-surface-variant shrink-0">Serge publishes.</span>
        )}
      </Card>

      {grouped.length === 0 && (
        <Card>
          <p className="font-body-sm text-body-sm text-on-surface-variant">No approved public facts yet.</p>
        </Card>
      )}

      {grouped.map(({ s, list }) => (
        <Card key={s.section_code} className="flex flex-col gap-space-12">
          <h3 className="font-label-sm text-label-sm text-outline uppercase tracking-wider">{s.title}</h3>
          {list.map((f) => {
            const snap = byField.get(f.field_code)!.approved_snapshot!;
            return (
              <div key={f.field_code} className="flex flex-col gap-space-4 border-t border-outline-variant/20 pt-space-12 first:border-0 first:pt-0">
                <span className="font-body-sm text-body-sm font-semibold text-on-surface">{f.label}</span>
                {snap.value_text && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[90ch] whitespace-pre-line">
                    {snap.value_text}
                  </p>
                )}
                {snap.value_rows && (
                  <ul className="flex flex-col gap-space-4">
                    {snap.value_rows.map((row, i) => (
                      <li key={i} className="font-body-sm text-body-sm text-on-surface-variant max-w-[90ch]">
                        {(f.columns ?? Object.keys(row))
                          .filter((k) => row[k]?.trim())
                          .map((k) => `${k}: ${row[k]}`)
                          .join(' · ')}
                      </li>
                    ))}
                  </ul>
                )}
                <span className="font-label-sm text-label-sm text-outline">Source: {snap.source_ref}</span>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}
