'use client';

import { Icon } from '../Shell';
import { Card, AuthorityBadge } from '../ui';
import type { BrainModule, BrainSummary } from '../types';

const STATUS_TONE: Record<string, string> = {
  approved: 'bg-secondary-container text-on-secondary-container',
  draft: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  in_review: 'bg-surface-container-high text-on-surface',
  missing: 'bg-surface-container text-outline',
  expired: 'bg-error-container text-on-error-container',
  conflicted: 'bg-error-container text-on-error-container',
  archived: 'bg-surface-container text-outline',
};

const CAP_LABELS: Record<string, string> = {
  no_accountable_human_owner: 'No accountable human owner',
  identity_or_legal_entity_unresolved: 'Identity or legal entity unresolved',
  active_critical_brain_conflict: 'Active critical Brain conflict',
  a3_thresholds_missing: 'A3 thresholds not set',
  no_tested_kill_switch_audit_verification: 'Kill switch / audit not tested',
  critical_connector_untested: 'Critical connector untested',
  active_sev1_or_kill_switch: 'Active SEV-1 or kill switch',
  expired_critical_module: 'Expired critical module',
};

export function CompanyBrain({
  companyName,
  modules,
  summary,
}: {
  companyName: string;
  modules: BrainModule[];
  summary: BrainSummary | null;
}) {
  if (!summary || modules.length === 0) {
    return (
      <Card className="max-w-3xl">
        <div className="flex items-start gap-space-16">
          <div className="h-10 w-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
            <Icon name="neurology" className="text-outline text-[22px]" />
          </div>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-primary">
              {companyName} has no Company Brain yet
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-space-4 max-w-[64ch]">
              It is registered in the portfolio and queued for onboarding. The Brain gets built during
              the Launchpad&apos;s discovery and build stages — 20 modules, each with its own owner and
              evidence requirements.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const score = Number(summary.readiness_score);

  return (
    <div className="flex flex-col w-full gap-space-24">
      <Card className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-24">
        <div className="flex flex-col min-w-0">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
            Company Brain
          </span>
          <h1 className="font-headline-md text-headline-md text-primary truncate">{companyName}</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-4 max-w-[70ch]">
            Readiness is weighted — each module carries the weight your specification assigns it, so
            approving a critical module moves the score more than a peripheral one.
          </p>
        </div>
        <div className="flex items-center gap-space-24 shrink-0">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-outline uppercase">Readiness</span>
            <span className="font-tabular-metric text-tabular-metric text-primary font-bold tabular-nums">
              {score}%
            </span>
            <div className="w-32 bg-surface-container-high h-1.5 rounded-full overflow-hidden mt-space-4">
              <div className="bg-secondary h-full rounded-full" style={{ width: `${score}%` }} />
            </div>
          </div>
          <div className="flex flex-col gap-space-4">
            <span className="font-label-sm text-label-sm text-outline uppercase">Authority</span>
            <AuthorityBadge
              level={summary.effective_level}
              capped={summary.uncapped_level !== summary.effective_level}
            />
            {summary.uncapped_level !== summary.effective_level && (
              <span className="font-label-sm text-label-sm text-outline">
                score allows {summary.uncapped_level}
              </span>
            )}
          </div>
        </div>
      </Card>

      {summary.active_hard_caps?.length > 0 && (
        <Card className="border border-error-container">
          <div className="flex items-start gap-space-12">
            <Icon name="gpp_maybe" className="text-error text-[22px] shrink-0" />
            <div className="min-w-0">
              <h3 className="font-headline-sm text-headline-sm text-primary">
                {summary.active_hard_caps.length} hard cap
                {summary.active_hard_caps.length === 1 ? '' : 's'} active
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2">
                A hard cap overrides the numeric score entirely. Until these clear, this company cannot
                be promoted no matter how complete its Brain is.
              </p>
              <div className="flex flex-wrap gap-space-8 mt-space-12">
                {summary.active_hard_caps.map((c) => (
                  <span
                    key={c.code}
                    className="font-body-sm text-body-sm px-space-12 py-space-4 rounded-lg bg-error-container text-on-error-container"
                  >
                    {CAP_LABELS[c.code] ?? c.code}
                    <span className="font-label-sm text-label-sm ml-space-8 opacity-70">
                      caps at {c.cap}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="px-space-20 py-space-16 border-b border-outline-variant/20 flex items-center justify-between gap-space-16">
          <div className="flex items-center gap-space-8">
            <Icon name="checklist" className="text-primary text-[20px]" />
            <h3 className="font-headline-sm text-headline-sm text-primary">
              {summary.modules_total} modules
            </h3>
          </div>
          <div className="flex items-center gap-space-12 font-label-sm text-label-sm text-outline">
            <span className="tabular-nums">{summary.modules_approved} approved</span>
            <span className="tabular-nums">{summary.modules_draft} draft</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm font-body-sm">
            <thead>
              <tr className="bg-surface-container-low text-left">
                {['Module', 'Status', 'Weight', 'Score', 'Gap'].map((h) => (
                  <th
                    key={h}
                    className="px-space-20 py-space-8 font-label-sm text-label-sm text-outline uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.module_code} className="border-t border-outline-variant/20 align-top">
                  <td className="px-space-20 py-space-12">
                    <div className="flex flex-col">
                      <span className="font-semibold text-on-surface">{m.module_name}</span>
                      <span className="font-label-sm text-label-sm text-outline tabular-nums">
                        {m.module_code}
                      </span>
                    </div>
                  </td>
                  <td className="px-space-20 py-space-12">
                    <span
                      className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded font-semibold uppercase ${
                        STATUS_TONE[m.status] ?? STATUS_TONE.missing
                      }`}
                    >
                      {m.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-space-20 py-space-12 tabular-nums text-on-surface-variant">
                    {Number(m.readiness_weight).toFixed(1)}
                  </td>
                  <td className="px-space-20 py-space-12 tabular-nums font-semibold text-on-surface">
                    {Number(m.score)}
                  </td>
                  <td className="px-space-20 py-space-12 text-on-surface-variant max-w-[40ch]">
                    {m.gap_note ?? <span className="text-outline">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
