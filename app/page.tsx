'use client';

import { useEffect, useMemo, useState } from 'react';

type Company = { id: string; name: string; slug: string; entity_type: string };
type Lead = {
  id: string;
  pipeline_stage: string;
  estimated_value: number | null;
  contact_id: string;
  contact_name: string;
  phone: string | null;
  lead_temperature: string | null;
  priority: string | null;
};
type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  status: string | null;
  lead_temperature: string | null;
  location: string | null;
  last_contact_at: string | null;
  next_action: string | null;
  owner: string | null;
  priority: string | null;
};
type Stats = {
  total_contacts: number;
  hot_leads: number;
  open_opportunities: number;
  open_opportunities_value: number;
};
type HardCap = { code: string; cap: string };
type LaunchpadEntry = {
  id: string;
  name: string;
  slug: string;
  entity_type: string;
  status: string;
  parent_name: string | null;
  modules_total: number;
  modules_approved: number;
  modules_draft: number;
  readiness_pct: number;
  uncapped_level: string | null;
  effective_level: string | null;
  active_hard_caps: HardCap[] | null;
  onboarding_state: string | null;
  onboarding_priority: string | null;
  stage: 'not_started' | 'in_progress' | 'brain_ready' | 'live';
  is_live: boolean;
};
type BlockerSubject = { label: string; note: string | null };
type Blocker = {
  kind: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  detail: string;
  subjects: BlockerSubject[];
};

const LAUNCHPAD_STAGES: { key: LaunchpadEntry['stage']; label: string }[] = [
  { key: 'not_started', label: 'Not Started' },
  { key: 'in_progress', label: 'Brain In Progress' },
  { key: 'brain_ready', label: 'Brain Ready (65%+)' },
  { key: 'live', label: 'Live' },
];

const CAP_LABELS: Record<string, string> = {
  no_accountable_human_owner: 'no human owner',
  identity_or_legal_entity_unresolved: 'identity unresolved',
  active_critical_brain_conflict: 'brain conflict',
  a3_thresholds_missing: 'no thresholds set',
  no_tested_kill_switch_audit_verification: 'writes unverified',
  critical_connector_untested: 'connector untested',
  active_sev1_or_kill_switch: 'incident active',
  expired_critical_module: 'expired module',
};

const COLUMNS: { key: string; label: string; stages: string[] }[] = [
  { key: 'new', label: 'New', stages: ['new', 'contacted', 'responded'] },
  { key: 'qualified', label: 'Qualified', stages: ['qualified', 'warm', 'hot'] },
  {
    key: 'progress',
    label: 'In Progress',
    stages: ['meeting_proposed', 'meeting_booked', 'proposal', 'negotiation'],
  },
  { key: 'won', label: 'Won', stages: ['won'] },
  { key: 'lost', label: 'Lost / Follow-up', stages: ['lost', 'follow_up_later'] },
];

function stageColumn(stage: string) {
  return COLUMNS.find((c) => c.stages.includes(stage))?.key ?? 'new';
}

export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [launchpad, setLaunchpad] = useState<LaunchpadEntry[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [tab, setTab] = useState<'pipeline' | 'contacts' | 'launchpad' | 'blockers'>('pipeline');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data: Company[]) => {
        setCompanies(data);
        const firstOperating = data.find((c) => c.entity_type !== 'portfolio') ?? data[0];
        if (firstOperating) setCompanyId(firstOperating.id);
      });
    fetch('/api/launchpad')
      .then((r) => r.json())
      .then((data: LaunchpadEntry[]) => setLaunchpad(data));
    fetch('/api/blockers')
      .then((r) => r.json())
      .then((data: Blocker[]) => setBlockers(data));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/stats?company_id=${companyId}`).then((r) => r.json()),
      fetch(`/api/leads?company_id=${companyId}`).then((r) => r.json()),
      fetch(`/api/contacts?company_id=${companyId}`).then((r) => r.json()),
    ]).then(([s, l, c]) => {
      setStats(s);
      setLeads(l);
      setContacts(c);
      setLoading(false);
    });
  }, [companyId]);

  const grouped = useMemo(() => {
    const g: Record<string, Lead[]> = {};
    for (const col of COLUMNS) g[col.key] = [];
    for (const lead of leads) g[stageColumn(lead.pipeline_stage)].push(lead);
    return g;
  }, [leads]);

  async function moveLead(leadId: string, newStage: string) {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: newStage } : l))
    );
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: leadId, pipeline_stage: newStage }),
    });
  }

  const currentCompany = companies.find((c) => c.id === companyId);

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <header className="flex items-center justify-between border-b-2 border-ink pb-4 mb-6">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-brassink font-semibold mb-1">
            Aya OS — Portfolio CRM
          </div>
          <h1 className="text-2xl font-bold">{currentCompany?.name ?? 'Loading…'}</h1>
        </div>
        <select
          className="border border-inksoft/30 bg-surface rounded px-3 py-2 text-sm font-mono"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </header>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatTile label="Total Contacts" value={stats.total_contacts} />
          <StatTile label="Hot Leads" value={stats.hot_leads} accent="warn" />
          <StatTile label="Open Opportunities" value={stats.open_opportunities} />
          <StatTile
            label="Pipeline Value"
            value={`$${Math.round(stats.open_opportunities_value).toLocaleString()}`}
          />
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-inksoft/20">
        {(['pipeline', 'contacts', 'launchpad', 'blockers'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px ${
              tab === t ? 'border-brass text-brassink' : 'border-transparent text-inksoft'
            }`}
          >
            {t === 'pipeline'
              ? 'Leads Pipeline'
              : t === 'contacts'
              ? 'Contacts'
              : t === 'launchpad'
              ? 'Launchpad'
              : 'Blockers'}
            {t === 'blockers' && blockers.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-mono bg-warnbg text-warn">
                {blockers.reduce((n, b) => n + b.subjects.length, 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="text-inksoft text-sm">Loading…</div>}

      {!loading && tab === 'pipeline' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="kanban-col flex-1 bg-surface/60 rounded border border-inksoft/15">
              <div className="px-3 py-2 border-b border-inksoft/15 font-semibold text-sm flex justify-between">
                <span>{col.label}</span>
                <span className="font-mono text-inksoft">{grouped[col.key]?.length ?? 0}</span>
              </div>
              <div className="p-2 flex flex-col gap-2 min-h-[120px]">
                {(grouped[col.key] ?? []).map((lead) => (
                  <div
                    key={lead.id}
                    className="bg-paper border border-inksoft/20 rounded p-3 text-sm shadow-sm"
                  >
                    <div className="font-semibold">{lead.contact_name}</div>
                    <div className="text-inksoft text-xs mt-0.5">{lead.phone}</div>
                    <div className="flex items-center justify-between mt-2">
                      {lead.estimated_value ? (
                        <span className="font-mono text-xs text-brassink">
                          ${Number(lead.estimated_value).toLocaleString()}
                        </span>
                      ) : (
                        <span />
                      )}
                      <select
                        className="text-xs border border-inksoft/20 rounded px-1 py-0.5 bg-white"
                        value={lead.pipeline_stage}
                        onChange={(e) => moveLead(lead.id, e.target.value)}
                      >
                        {COLUMNS.flatMap((c) => c.stages).map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === 'contacts' && (
        <div className="overflow-x-auto border border-inksoft/15 rounded">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left">
              <tr>
                {['Name', 'Phone', 'Relationship', 'Status', 'Temp', 'Location', 'Next Action', 'Owner'].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 font-semibold text-xs uppercase tracking-wide text-inksoft">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t border-inksoft/10">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.phone}</td>
                  <td className="px-3 py-2">{c.relationship}</td>
                  <td className="px-3 py-2">{c.status}</td>
                  <td className="px-3 py-2">
                    {c.lead_temperature && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-semibold ${
                          c.lead_temperature === 'hot'
                            ? 'bg-warnbg text-warn'
                            : c.lead_temperature === 'warm'
                            ? 'bg-okbg text-ok'
                            : 'bg-surface text-inksoft'
                        }`}
                      >
                        {c.lead_temperature}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{c.location}</td>
                  <td className="px-3 py-2 text-inksoft">{c.next_action}</td>
                  <td className="px-3 py-2">{c.owner}</td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-inksoft">
                    No contacts yet for this company.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'launchpad' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {LAUNCHPAD_STAGES.map((stageCol) => {
            const entries = launchpad.filter((e) => e.stage === stageCol.key);
            return (
              <div
                key={stageCol.key}
                className="kanban-col flex-1 bg-surface/60 rounded border border-inksoft/15 min-w-[240px]"
              >
                <div className="px-3 py-2 border-b border-inksoft/15 font-semibold text-sm flex justify-between">
                  <span>{stageCol.label}</span>
                  <span className="font-mono text-inksoft">{entries.length}</span>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-[120px]">
                  {entries.map((e) => (
                    <div
                      key={e.id}
                      className="bg-paper border border-inksoft/20 rounded p-3 text-sm shadow-sm"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{e.name}</span>
                        {e.is_live && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-okbg text-ok">
                            LIVE
                          </span>
                        )}
                      </div>
                      {e.parent_name && (
                        <div className="text-inksoft text-xs mt-0.5">under {e.parent_name}</div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-mono text-xs text-brassink">
                          {e.modules_approved}/20 modules
                        </span>
                        <span className="font-mono text-xs text-inksoft">
                          {e.readiness_pct ?? 0}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-inksoft/10 rounded mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-brass"
                          style={{ width: `${e.readiness_pct ?? 0}%` }}
                        />
                      </div>
                      {e.effective_level && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-inksoft/10">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-surface text-inksoft">
                            cap {e.effective_level}
                          </span>
                          {e.uncapped_level && e.uncapped_level !== e.effective_level && (
                            <span className="text-[10px] text-inksoft font-mono">
                              (score allows {e.uncapped_level})
                            </span>
                          )}
                        </div>
                      )}
                      {e.active_hard_caps && e.active_hard_caps.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {e.active_hard_caps.map((c) => (
                            <span
                              key={c.code}
                              title={`caps this company at ${c.cap}`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-warnbg text-warn"
                            >
                              {CAP_LABELS[c.code] ?? c.code}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {entries.length === 0 && (
                    <div className="text-inksoft text-xs text-center py-4">None</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'blockers' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-inksoft max-w-[70ch]">
            Everything currently waiting on a human decision, generated from the portfolio
            manifest and the Company Brain readiness rules — not hand-maintained.
          </p>
          {blockers.map((b) => (
            <div
              key={b.kind}
              className={`border rounded overflow-hidden ${
                b.severity === 'critical'
                  ? 'border-warn/50'
                  : 'border-inksoft/20'
              }`}
            >
              <div className="px-4 py-3 bg-surface border-b border-inksoft/15">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
                      b.severity === 'critical'
                        ? 'bg-warnbg text-warn'
                        : 'bg-surface text-inksoft border border-inksoft/20'
                    }`}
                  >
                    {b.severity}
                  </span>
                  <span className="font-semibold text-sm">{b.title}</span>
                  <span className="font-mono text-xs text-inksoft ml-auto">
                    {b.subjects.length}
                  </span>
                </div>
                <div className="text-xs text-inksoft mt-1 max-w-[80ch]">{b.detail}</div>
              </div>
              <div className="divide-y divide-inksoft/10">
                {b.subjects.map((s, i) => (
                  <div key={i} className="px-4 py-2 flex gap-3 text-sm">
                    <span className="font-medium min-w-[180px]">{s.label}</span>
                    <span className="text-inksoft text-xs pt-0.5">{s.note}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {blockers.length === 0 && (
            <div className="text-inksoft text-sm py-8 text-center border border-inksoft/15 rounded">
              Nothing blocked. Every entity is verified and owned.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: 'warn';
}) {
  return (
    <div className="bg-surface border border-inksoft/15 rounded p-4">
      <div className="text-xs uppercase tracking-wide text-inksoft mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${accent === 'warn' ? 'text-warn' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}
