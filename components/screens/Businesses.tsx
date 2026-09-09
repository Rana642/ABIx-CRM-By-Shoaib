'use client';

import { useState } from 'react';
import { Icon } from '../Shell';
import { Card, SectionHeader, StateChip, AuthorityBadge } from '../ui';
import type { LaunchpadEntry, Blocker } from '../types';

const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'Brain in progress',
  brain_ready: 'Brain ready',
  live: 'Live within limits',
};

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

export function Businesses({
  launchpad,
  blockers,
  onOpenBrain,
}: {
  launchpad: LaunchpadEntry[];
  blockers: Blocker[];
  onOpenBrain: (companyId: string) => void;
}) {
  const [view, setView] = useState<'portfolio' | 'decisions'>('portfolio');

  const stages: LaunchpadEntry['stage'][] = ['not_started', 'in_progress', 'brain_ready', 'live'];

  return (
    <div className="flex flex-col w-full gap-space-24">
      <Card className="flex flex-col gap-space-16">
        <div className="flex flex-wrap items-center justify-between gap-space-16">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Portfolio
            </span>
            <h1 className="font-headline-md text-headline-md text-primary">
              {launchpad.length} businesses, brands, products and projects
            </h1>
          </div>
          <div className="flex items-center gap-space-8">
            <button
              type="button"
              onClick={() => setView('portfolio')}
              className={`flex items-center gap-space-8 px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm whitespace-nowrap transition-colors ${
                view === 'portfolio'
                  ? 'bg-primary-container text-on-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <Icon name="view_kanban" className="text-[18px]" />
              <span>Onboarding board</span>
            </button>
            <button
              type="button"
              onClick={() => setView('decisions')}
              className={`flex items-center gap-space-8 px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm whitespace-nowrap transition-colors ${
                view === 'decisions'
                  ? 'bg-primary-container text-on-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <Icon name="gavel" className="text-[18px]" />
              <span>Decision queue</span>
              <span className="px-space-4 py-0.5 rounded bg-error text-on-error font-label-sm text-label-sm font-bold tabular-nums">
                {blockers.reduce((n, b) => n + b.subjects.length, 0)}
              </span>
            </button>
          </div>
        </div>
      </Card>

      {view === 'portfolio' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-16 items-start">
          {stages.map((stage) => {
            const entries = launchpad.filter((e) => e.stage === stage);
            return (
              <div
                key={stage}
                className="flex flex-col gap-space-12 bg-surface-container-low/70 p-space-12 rounded-xl"
              >
                <div className="flex items-center justify-between px-space-4 py-space-2">
                  <div className="flex items-center gap-space-8 min-w-0">
                    <StateChip state={stage} label={STAGE_LABEL[stage]} />
                  </div>
                  <span className="font-label-sm text-label-sm px-space-4 py-0.5 rounded bg-surface-container text-outline font-semibold tabular-nums">
                    {entries.length}
                  </span>
                </div>
                <div className="flex flex-col gap-space-12">
                  {entries.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onOpenBrain(e.id)}
                      className="text-left bg-surface-container-lowest p-space-16 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col gap-space-12"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-space-8">
                          <h4 className="font-headline-sm text-headline-sm text-primary font-semibold min-w-0 truncate">
                            {e.name}
                          </h4>
                          <AuthorityBadge
                            level={e.effective_level ?? 'A0'}
                            capped={!!e.uncapped_level && e.uncapped_level !== e.effective_level}
                          />
                        </div>
                        {e.parent_name && (
                          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2 truncate">
                            under {e.parent_name}
                          </p>
                        )}
                      </div>

                      {e.modules_total > 0 ? (
                        <div className="bg-surface-container-low p-space-8 rounded-lg flex flex-col gap-space-4">
                          <div className="flex items-center justify-between text-label-sm font-label-sm">
                            <span className="text-outline">Brain</span>
                            <span className="text-on-surface font-semibold tabular-nums">
                              {e.modules_approved} / {e.modules_total} approved
                            </span>
                          </div>
                          <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-secondary h-full rounded-full"
                              style={{ width: `${e.readiness_pct ?? 0}%` }}
                            />
                          </div>
                          <span className="font-label-sm text-label-sm text-outline tabular-nums">
                            {e.readiness_pct ?? 0}% readiness
                          </span>
                        </div>
                      ) : (
                        <div className="bg-surface-container-low p-space-8 rounded-lg">
                          <span className="font-label-sm text-label-sm text-outline">
                            No Brain modules yet — registered and queued
                          </span>
                        </div>
                      )}

                      {e.active_hard_caps && e.active_hard_caps.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {e.active_hard_caps.slice(0, 2).map((c) => (
                            <span
                              key={c.code}
                              className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-error-container text-on-error-container"
                            >
                              {CAP_LABELS[c.code] ?? c.code}
                            </span>
                          ))}
                          {e.active_hard_caps.length > 2 && (
                            <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container text-outline tabular-nums">
                              +{e.active_hard_caps.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                  {entries.length === 0 && (
                    <div className="text-outline font-label-sm text-label-sm text-center py-space-16">
                      None
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'decisions' && (
        <div className="flex flex-col gap-space-16">
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[76ch]">
            Everything waiting on a human decision, generated from the portfolio manifest and the
            readiness hard caps rather than hand-maintained.
          </p>
          {blockers.map((b) => (
            <Card key={b.kind} padded={false} className="overflow-hidden">
              <div className="px-space-20 py-space-16 bg-surface-container-low border-b border-outline-variant/20">
                <div className="flex items-center gap-space-8 flex-wrap">
                  <span
                    className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded font-semibold uppercase tracking-wide ${
                      b.severity === 'critical'
                        ? 'bg-error-container text-on-error-container'
                        : b.severity === 'high'
                        ? 'bg-tertiary-fixed text-on-tertiary-fixed-variant'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {b.severity}
                  </span>
                  <span className="font-headline-sm text-headline-sm text-primary">{b.title}</span>
                  <span className="font-label-sm text-label-sm text-outline ml-auto tabular-nums">
                    {b.subjects.length}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-4 max-w-[80ch]">
                  {b.detail}
                </p>
              </div>
              <div className="divide-y divide-outline-variant/20">
                {b.subjects.map((s, i) => (
                  <div key={i} className="px-space-20 py-space-12 flex flex-wrap gap-space-12">
                    <span className="font-body-sm text-body-sm font-semibold min-w-[200px]">
                      {s.label}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{s.note}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
