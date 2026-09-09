'use client';

import { useMemo, useState } from 'react';
import { Icon } from '../Shell';
import { Card, MetricCard, NotConnected } from '../ui';
import type { Lead, Contact, Stats } from '../types';

const COLUMNS: { key: string; label: string; stages: string[]; dot: string }[] = [
  { key: 'new', label: 'New', stages: ['new', 'contacted', 'responded'], dot: 'bg-outline' },
  { key: 'qualified', label: 'Qualified', stages: ['qualified', 'warm', 'hot'], dot: 'bg-tertiary' },
  {
    key: 'progress',
    label: 'In Progress',
    stages: ['meeting_proposed', 'meeting_booked', 'proposal', 'negotiation'],
    dot: 'bg-secondary',
  },
  { key: 'won', label: 'Won / Onboarded', stages: ['won'], dot: 'bg-on-secondary-container' },
  { key: 'lost', label: 'Lost / Follow-up', stages: ['lost', 'follow_up_later'], dot: 'bg-error' },
];

function stageColumn(stage: string) {
  return COLUMNS.find((c) => c.stages.includes(stage))?.key ?? 'new';
}

export function SalesCustomers({
  companyName,
  stats,
  leads,
  contacts,
  onMoveLead,
}: {
  companyName: string;
  stats: Stats | null;
  leads: Lead[];
  contacts: Contact[];
  onMoveLead: (leadId: string, stage: string) => void;
}) {
  const [tab, setTab] = useState<'pipeline' | 'contacts'>('pipeline');
  const [selected, setSelected] = useState<Lead | null>(null);

  const grouped = useMemo(() => {
    const g: Record<string, Lead[]> = {};
    for (const col of COLUMNS) g[col.key] = [];
    for (const lead of leads) g[stageColumn(lead.pipeline_stage)].push(lead);
    return g;
  }, [leads]);

  const pipelineValue = leads.reduce((n, l) => n + Number(l.estimated_value ?? 0), 0);

  return (
    <div className="flex flex-col w-full gap-space-24">
      {/* Command deck */}
      <Card className="flex flex-col gap-space-16">
        <div className="flex flex-wrap items-center justify-between gap-space-16">
          <div className="flex items-center gap-space-8 bg-surface-container-low px-space-12 py-space-8 rounded-lg">
            <Icon name="villa" className="text-secondary text-[20px]" />
            <div className="flex flex-col min-w-0">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                Active workspace
              </span>
              <span className="font-headline-sm text-headline-sm text-on-surface font-semibold leading-tight truncate">
                {companyName}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-space-4 overflow-x-auto pb-space-4 border-b border-surface-container">
          <TabButton
            active={tab === 'pipeline'}
            icon="view_kanban"
            label="Pipeline Board"
            onClick={() => setTab('pipeline')}
          />
          <TabButton
            active={tab === 'contacts'}
            icon="groups"
            label="Contacts"
            badge={contacts.length}
            onClick={() => setTab('contacts')}
          />
          {['Conversations & WhatsApp', 'Campaigns', 'Appointments', 'Customer Issues'].map((l) => (
            <span
              key={l}
              title="Not built yet"
              className="flex items-center gap-space-8 px-space-12 py-space-8 rounded-lg text-outline font-body-sm text-body-sm whitespace-nowrap cursor-not-allowed"
            >
              <Icon name="lock" className="text-[16px]" />
              <span>{l}</span>
            </span>
          ))}
        </div>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-16">
        <MetricCard
          label="Pipeline value"
          icon="monetization_on"
          value={`€${Math.round(pipelineValue).toLocaleString()}`}
          sub={
            <span className="font-body-sm text-body-sm text-outline">
              across {leads.length} open lead{leads.length === 1 ? '' : 's'}
            </span>
          }
        />
        <MetricCard
          label="Contacts"
          icon="person_check"
          value={stats?.total_contacts ?? 0}
          sub={
            <span className="font-body-sm text-body-sm text-outline">
              {stats?.hot_leads ?? 0} marked hot
            </span>
          }
        />
        <MetricCard
          label="Open opportunities"
          icon="handshake"
          value={stats?.open_opportunities ?? 0}
          sub={
            <span className="font-body-sm text-body-sm text-outline tabular-nums">
              €{Math.round(stats?.open_opportunities_value ?? 0).toLocaleString()} value
            </span>
          }
        />
        <NotConnected
          label="Reply rate"
          icon="chat_bubble"
          reason="Message-level analytics are not captured yet — the WhatsApp agent records contacts and leads, not per-message outcomes."
        />
      </div>

      {tab === 'pipeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-20 items-start">
          <div
            className={`${
              selected ? 'lg:col-span-8' : 'lg:col-span-12'
            } grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-space-16 items-start`}
          >
            {COLUMNS.map((col) => {
              const items = grouped[col.key] ?? [];
              const colValue = items.reduce((n, l) => n + Number(l.estimated_value ?? 0), 0);
              return (
                <div
                  key={col.key}
                  className="flex flex-col gap-space-12 bg-surface-container-low/70 p-space-12 rounded-xl"
                >
                  <div className="flex items-center justify-between px-space-4 py-space-2">
                    <div className="flex items-center gap-space-8 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full ${col.dot} shrink-0`} />
                      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">
                        {col.label}
                      </span>
                      <span className="font-label-sm text-label-sm px-space-4 py-0.5 rounded bg-surface-container text-outline font-semibold tabular-nums">
                        {items.length}
                      </span>
                    </div>
                  </div>
                  {colValue > 0 && (
                    <span className="font-label-sm text-label-sm text-outline tabular-nums px-space-4">
                      €{Math.round(colValue).toLocaleString()}
                    </span>
                  )}
                  <div className="flex flex-col gap-space-12">
                    {items.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setSelected(lead)}
                        className={`text-left bg-surface-container-lowest p-space-16 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col gap-space-12 ${
                          selected?.id === lead.id ? 'ring-2 ring-secondary' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-space-8">
                          {lead.lead_temperature && (
                            <span
                              className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                                lead.lead_temperature === 'hot'
                                  ? 'bg-error-container text-on-error-container'
                                  : lead.lead_temperature === 'warm'
                                  ? 'bg-secondary-container text-on-secondary-container'
                                  : 'bg-surface-container text-on-surface-variant'
                              }`}
                            >
                              {lead.lead_temperature}
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-headline-sm text-headline-sm text-primary font-semibold truncate">
                            {lead.contact_name}
                          </h4>
                          {lead.phone && (
                            <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2 tabular-nums">
                              {lead.phone}
                            </p>
                          )}
                        </div>
                        {lead.estimated_value ? (
                          <div className="flex items-center justify-between pt-space-4 border-t border-surface-container">
                            <span className="font-label-sm text-label-sm text-outline">Value</span>
                            <span className="font-semibold text-primary tabular-nums">
                              €{Number(lead.estimated_value).toLocaleString()}
                            </span>
                          </div>
                        ) : null}
                      </button>
                    ))}
                    {items.length === 0 && (
                      <div className="text-outline font-label-sm text-label-sm text-center py-space-16">
                        None
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selected && (
            <Card className="lg:col-span-4 flex flex-col gap-space-20">
              <div className="flex items-start justify-between gap-space-12 pb-space-16 border-b border-surface-container">
                <div className="flex items-center gap-space-12 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center font-bold shrink-0">
                    {selected.contact_name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold truncate">
                      {selected.contact_name}
                    </h3>
                    <span className="font-body-sm text-body-sm text-outline tabular-nums">
                      {selected.phone ?? 'no phone recorded'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-outline hover:text-on-surface transition-colors p-space-4 rounded-lg hover:bg-surface-container"
                  title="Close"
                >
                  <Icon name="close" className="text-[20px]" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-space-8">
                <div className="bg-surface-container-low p-space-12 rounded-lg flex flex-col">
                  <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                    Opportunity
                  </span>
                  <span className="font-tabular-dense text-tabular-dense text-primary font-bold mt-space-2 tabular-nums">
                    {selected.estimated_value
                      ? `€${Number(selected.estimated_value).toLocaleString()}`
                      : '—'}
                  </span>
                </div>
                <div className="bg-surface-container-low p-space-12 rounded-lg flex flex-col">
                  <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
                    Priority
                  </span>
                  <span className="font-tabular-dense text-tabular-dense text-on-surface font-bold mt-space-2">
                    {selected.priority ?? '—'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-space-8">
                <label
                  className="font-label-sm text-label-sm text-outline uppercase tracking-wider"
                  htmlFor="stage-select"
                >
                  Pipeline stage
                </label>
                <select
                  id="stage-select"
                  value={selected.pipeline_stage}
                  onChange={(e) => {
                    onMoveLead(selected.id, e.target.value);
                    setSelected({ ...selected, pipeline_stage: e.target.value });
                  }}
                  className="h-10 px-space-12 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
                >
                  {COLUMNS.flatMap((c) => c.stages).map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-surface-container-low p-space-12 rounded-lg">
                <div className="flex items-center gap-space-6 text-on-surface">
                  <Icon name="smart_toy" className="text-outline text-[16px]" />
                  <span className="font-label-md text-label-md font-semibold">Aya draft replies</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-4">
                  Not available yet. The WhatsApp agent replies live but does not stage drafts for
                  approval — that needs the orchestrator and an A2 send permission.
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm font-body-sm">
              <thead>
                <tr className="bg-surface-container-low text-left">
                  {['Name', 'Phone', 'Relationship', 'Status', 'Temp', 'Location', 'Next action'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-space-16 py-space-8 font-label-sm text-label-sm text-outline uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-t border-outline-variant/20">
                    <td className="px-space-16 py-space-12 font-semibold text-on-surface">{c.name}</td>
                    <td className="px-space-16 py-space-12 tabular-nums text-on-surface-variant">
                      {c.phone}
                    </td>
                    <td className="px-space-16 py-space-12 text-on-surface-variant">
                      {c.relationship}
                    </td>
                    <td className="px-space-16 py-space-12 text-on-surface-variant">{c.status}</td>
                    <td className="px-space-16 py-space-12">
                      {c.lead_temperature && (
                        <span
                          className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded font-semibold uppercase ${
                            c.lead_temperature === 'hot'
                              ? 'bg-error-container text-on-error-container'
                              : c.lead_temperature === 'warm'
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'bg-surface-container text-on-surface-variant'
                          }`}
                        >
                          {c.lead_temperature}
                        </span>
                      )}
                    </td>
                    <td className="px-space-16 py-space-12 text-on-surface-variant">{c.location}</td>
                    <td className="px-space-16 py-space-12 text-on-surface-variant">
                      {c.next_action}
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-space-16 py-space-40 text-center text-outline">
                      No contacts recorded for this business yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-space-8 px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm whitespace-nowrap transition-colors ${
        active
          ? 'bg-primary-container text-on-primary font-semibold shadow-sm'
          : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <Icon name={icon} className="text-[18px]" />
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className={`px-space-4 py-0.5 rounded font-label-sm text-label-sm font-semibold tabular-nums ${
            active ? 'bg-on-primary/20' : 'bg-surface-container text-outline'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
