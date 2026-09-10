'use client';

import { Icon } from '../Shell';
import { AyaLoader } from '../AyaLogo';
import { Card, MetricCard, NotConnected, SectionHeader, StateChip, AuthorityBadge } from '../ui';
import type { Portfolio, Blocker, LaunchpadEntry } from '../types';

const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'Brain in progress',
  brain_ready: 'Brain ready',
  live: 'Live within limits',
};

export function Overview({
  portfolio,
  blockers,
  launchpad,
  onNavigate,
}: {
  portfolio: Portfolio | null;
  blockers: Blocker[];
  launchpad: LaunchpadEntry[];
  onNavigate: (s: any) => void;
}) {
  if (!portfolio) return <AyaLoader label="Reading the portfolio…" />;

  // The viewer's own clock, so the greeting is right wherever Serge is.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const decisions = portfolio.decisions;
  const withBrain = launchpad.filter((e) => e.modules_total > 0);
  const asOf = new Date(portfolio.as_of);

  const above = portfolio.autonomy.companies_above_a0;
  const capped = withBrain.filter(
    (e) => e.uncapped_level && e.uncapped_level !== e.effective_level
  );
  // The most-affected open decision, so the headline metric names a real cause
  // instead of assuming which blocker is dominant.
  const topBlocker = [...blockers].sort((a, b) => b.subjects.length - a.subjects.length)[0];
  // Closest to promotion: highest score still short of the next authority level.
  const nextUp = [...withBrain].sort(
    (a, b) => (b.readiness_pct ?? 0) - (a.readiness_pct ?? 0)
  )[0];

  return (
    <div className="flex flex-col w-full">
      {/* Executive header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-16 pb-space-24">
        <div className="flex flex-col">
          <div className="flex items-center gap-space-8 flex-wrap">
            <span className="font-label-sm text-label-sm text-outline tracking-wider uppercase">
              Executive Overview
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-semibold">
              {above === 0
                ? 'Observe only — no company promoted yet'
                : `${above} of ${portfolio.companies.total} above observe-only`}
            </span>
          </div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile md:font-display md:text-display text-primary mt-space-4 text-balance">
            {greeting}, Serge.
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {decisions.total === 0
              ? 'Nothing is waiting on you. Nothing acts without your approval.'
              : `${decisions.total} decision${
                  decisions.total === 1 ? ' is' : 's are'
                } waiting on you. Nothing acts without your approval.`}
          </p>
        </div>
        <div className="flex items-center gap-space-12 flex-wrap">
          <div className="flex items-center gap-space-8 px-space-12 py-space-8 rounded-lg bg-surface-container-lowest shadow-sm">
            <Icon name="sync" className="text-secondary text-[18px]" />
            <span className="font-body-sm text-body-sm text-outline">
              Read live{' '}
              <strong className="text-on-surface font-semibold tabular-nums">
                {asOf.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('businesses')}
            className="flex items-center gap-space-8 px-space-16 py-space-8 rounded-lg bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors"
          >
            <Icon name="domain" className="text-[18px]" />
            <span className="font-body-sm text-body-sm font-semibold">View businesses</span>
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-space-16 mb-space-32">
        <MetricCard
          label="Businesses"
          icon="domain"
          value={portfolio.companies.total}
          sub={
            <span className="font-body-sm text-body-sm text-outline">
              {portfolio.brains.companies_with_brain} with a Brain started
            </span>
          }
          footer={
            <>
              <span className="font-label-sm text-label-sm text-outline uppercase">Portfolio graph</span>
              <span className="h-2 w-2 rounded-full bg-secondary" />
            </>
          }
        />
        <MetricCard
          label="Avg Brain readiness"
          icon="neurology"
          value={`${portfolio.brains.avg_readiness}%`}
          sub={
            <span className="font-body-sm text-body-sm text-outline">
              {portfolio.brains.modules_approved} of {portfolio.brains.modules_total} modules approved
            </span>
          }
          progress={Number(portfolio.brains.avg_readiness)}
        />
        <MetricCard
          label="Decisions waiting"
          icon="gavel"
          tone="alert"
          value={decisions.total}
          sub={
            <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
              {topBlocker
                ? `Largest: ${topBlocker.title.toLowerCase()} (${topBlocker.subjects.length})`
                : 'Every recorded question has been answered'}
            </span>
          }
          footer={
            <>
              <span className="font-label-sm text-label-sm text-outline uppercase">
                {capped.length > 0 ? 'Blocking autonomy' : 'Not blocking autonomy'}
              </span>
              <span
                className={`h-2 w-2 rounded-full ${
                  capped.length > 0 ? 'bg-error' : 'bg-secondary'
                }`}
              />
            </>
          }
        />
        <MetricCard
          label="Autonomous coverage"
          icon="bolt"
          value={`${above} / ${portfolio.companies.total}`}
          sub={
            <span className="font-body-sm text-body-sm text-outline">
              above observe-only · {portfolio.autonomy.verified_actions} verified actions
            </span>
          }
          progress={(above / Math.max(1, portfolio.companies.total)) * 100}
        />
        <NotConnected
          label="AI & tool spend"
          icon="price_check"
          reason={portfolio.unavailable.ai_spend}
        />
      </div>

      {/* Briefing quadrants */}
      <div className="mb-space-40">
        <SectionHeader icon="assignment" title="Executive Briefing & Decision Queue">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
            Generated from your portfolio manifest
          </span>
        </SectionHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-24">
          {/* A — Needs your decision */}
          <Card padded={false} className="p-space-24 flex flex-col">
            <div className="flex items-center justify-between pb-space-16 border-b border-surface-container">
              <div className="flex items-center gap-space-8">
                <Icon name="gavel" className="text-error text-[20px]" />
                <h3 className="font-headline-sm text-headline-sm text-primary">Needs your decision</h3>
              </div>
              <span className="px-space-8 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-semibold tabular-nums">
                {decisions.total} items
              </span>
            </div>
            <div className="flex flex-col gap-space-12 mt-space-16">
              {blockers.length === 0 && (
                <div className="p-space-16 rounded-lg bg-surface-container-low flex items-start gap-space-12">
                  <Icon name="check_circle" className="text-secondary text-[20px] mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-space-4">
                    <span className="font-body-md text-body-md text-on-surface font-semibold">
                      Nothing is waiting on you
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[52ch]">
                      Every open question in the portfolio manifest has been answered. New ones
                      appear here as entities are onboarded.
                    </p>
                  </div>
                </div>
              )}
              {blockers.slice(0, 3).map((b) => (
                <div
                  key={b.kind}
                  className="p-space-12 rounded-lg bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-space-12"
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-space-8">
                      <span
                        className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded font-semibold uppercase ${
                          b.severity === 'critical'
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-surface-container-highest text-on-surface'
                        }`}
                      >
                        {b.severity}
                      </span>
                      <span className="font-label-sm text-label-sm text-outline tabular-nums">
                        {b.subjects.length} affected
                      </span>
                    </div>
                    <span className="font-body-md text-body-md text-on-surface font-semibold mt-1">
                      {b.title}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                      {b.detail}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('businesses')}
                    className="shrink-0 px-space-12 py-space-4 rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-medium transition-colors"
                  >
                    Inspect
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-space-16 pt-space-12 border-t border-surface-container flex items-center justify-between text-outline font-label-sm text-label-sm">
              <span>Every item traces back to a record in your manifest</span>
              {blockers.length > 3 && (
                <button
                  type="button"
                  onClick={() => onNavigate('businesses')}
                  className="text-on-surface font-semibold hover:underline"
                >
                  View all {blockers.length} groups →
                </button>
              )}
            </div>
          </Card>

          {/* B — Completed & verified */}
          <Card padded={false} className="p-space-24 flex flex-col">
            <div className="flex items-center justify-between pb-space-16 border-b border-surface-container">
              <div className="flex items-center gap-space-8">
                <Icon name="check_circle" className="text-outline text-[20px]" />
                <h3 className="font-headline-sm text-headline-sm text-primary">Completed & verified</h3>
              </div>
              <span className="font-label-sm text-label-sm text-outline uppercase font-semibold">
                Audited
              </span>
            </div>
            <div className="mt-space-16 p-space-16 rounded-lg bg-surface-container-low flex items-start gap-space-12">
              <Icon name="hourglass_empty" className="text-outline text-[20px] mt-0.5 shrink-0" />
              <div className="flex flex-col gap-space-4">
                <span className="font-body-md text-body-md text-on-surface font-semibold">
                  No agent has executed yet
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant max-w-[52ch]">
                  {portfolio.unavailable.missions} Once work is dispatched, every completed action
                  appears here with its verification evidence.
                </p>
              </div>
            </div>
            <div className="mt-space-16 pt-space-12 border-t border-surface-container flex items-center justify-between font-label-sm text-label-sm text-outline">
              <span>Audit trail ready — {portfolio.ops.agent_runs} runs recorded</span>
            </div>
          </Card>

          {/* C — Issues requiring attention */}
          <Card padded={false} className="p-space-24 flex flex-col">
            <div className="flex items-center justify-between pb-space-16 border-b border-surface-container">
              <div className="flex items-center gap-space-8">
                <Icon name="build_circle" className="text-outline text-[20px]" />
                <h3 className="font-headline-sm text-headline-sm text-primary">
                  Issues requiring attention
                </h3>
              </div>
              <span className="px-space-8 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm text-on-surface-variant font-semibold tabular-nums">
                {portfolio.ops.open_incidents + (portfolio.ops.connectors === 0 ? 1 : 0)} active
              </span>
            </div>
            <div className="flex flex-col gap-space-12 mt-space-16">
              <div className="p-space-12 rounded-lg bg-surface-container-low flex items-start gap-space-8">
                <Icon name="link_off" className="text-outline text-[20px] mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md font-semibold text-on-surface">
                    No connectors registered
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {portfolio.unavailable.connectors} Until one is, agents can read and write nothing
                    outside this database.
                  </span>
                </div>
              </div>
              {portfolio.ops.open_incidents === 0 && (
                <div className="p-space-12 rounded-lg bg-surface-container-low flex items-start gap-space-8">
                  <Icon name="check_circle" className="text-secondary text-[20px] mt-0.5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-body-md text-body-md font-semibold text-on-surface">
                      No open incidents
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      No SEV-level incident declared and no kill switch active.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* D — Recommended next actions */}
          <Card padded={false} className="p-space-24 flex flex-col">
            <div className="flex items-center justify-between pb-space-16 border-b border-surface-container">
              <div className="flex items-center gap-space-8">
                <Icon name="lightbulb" className="text-secondary text-[20px]" />
                <h3 className="font-headline-sm text-headline-sm text-primary">
                  Recommended next actions
                </h3>
              </div>
              <span className="font-label-sm text-label-sm text-secondary font-semibold uppercase">
                Highest leverage first
              </span>
            </div>
            <div className="flex flex-col gap-space-12 mt-space-16">
              {decisions.missing_owner > 0 && (
                <Recommendation
                  icon="person_add"
                  tone="text-primary"
                  title="Name an accountable owner for each company"
                  detail={`One input lifts the hard cap on ${decisions.missing_owner} companies at once.`}
                />
              )}
              {nextUp && (
                <Recommendation
                  icon="neurology"
                  tone="text-tertiary"
                  title={`Complete ${nextUp.name}'s remaining Brain modules`}
                  detail={`At ${nextUp.readiness_pct ?? 0}% it is the closest to the next authority level — ${
                    nextUp.modules_total - nextUp.modules_approved
                  } of ${nextUp.modules_total} modules still unapproved.`}
                />
              )}
              {capped.length > 0 && (
                <Recommendation
                  icon="gpp_maybe"
                  tone="text-error"
                  title="Clear the remaining hard caps"
                  detail={`${capped.length} compan${
                    capped.length === 1 ? 'y is' : 'ies are'
                  } scoring above the level they are allowed to operate at.`}
                />
              )}
              {portfolio.ops.connectors === 0 && (
                <Recommendation
                  icon="hub"
                  tone="text-outline"
                  title="Register the first connector"
                  detail="Nothing can act outside this database until one system is connected, scoped and health-checked."
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Business portfolio */}
      <div className="mb-space-32">
        <SectionHeader
          icon="domain"
          title="Business portfolio"
          meta={`(${withBrain.length} with a Brain started · ${
            launchpad.length - withBrain.length
          } queued)`}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-16">
          {withBrain.map((e) => (
            <Card key={e.id} className="flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center justify-between mb-space-12 gap-space-8">
                  <StateChip state={e.stage} label={STAGE_LABEL[e.stage] ?? e.stage} />
                  <span className="font-label-sm text-label-sm font-bold text-primary tabular-nums">
                    {e.readiness_pct ?? 0}%
                  </span>
                </div>
                <h4 className="font-headline-sm text-headline-sm text-primary truncate" title={e.name}>
                  {e.name}
                </h4>
                {e.parent_name && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 truncate">
                    under {e.parent_name}
                  </p>
                )}
                <div className="mt-space-16 pt-space-12 border-t border-surface-container flex flex-col gap-space-8">
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-outline">Brain modules</span>
                    <span className="font-semibold text-on-surface tabular-nums">
                      {e.modules_approved} / {e.modules_total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-body-sm">
                    <span className="text-outline">Authority</span>
                    <AuthorityBadge
                      level={e.effective_level ?? 'A0'}
                      capped={!!e.uncapped_level && e.uncapped_level !== e.effective_level}
                    />
                  </div>
                  {e.active_hard_caps && e.active_hard_caps.length > 0 && (
                    <div className="flex flex-col gap-1 mt-space-4">
                      <span className="font-label-sm text-label-sm text-outline uppercase">
                        Blocked by
                      </span>
                      <span className="font-body-sm text-body-sm text-primary font-medium truncate">
                        {e.active_hard_caps.length} hard cap
                        {e.active_hard_caps.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-space-16 pt-space-12 border-t border-surface-container">
                <button
                  type="button"
                  onClick={() => onNavigate('company-brain')}
                  className="w-full py-1.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center justify-center gap-1"
                >
                  <span>Open Company Brain</span>
                  <Icon name="arrow_forward" className="text-[14px]" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Governance banner */}
      <Card className="flex flex-col sm:flex-row items-center justify-between gap-space-12">
        <div className="flex items-center gap-space-12">
          <div className="h-8 w-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
            <Icon name="security" className="text-on-surface-variant text-[20px]" />
          </div>
          <div className="flex flex-col">
            <span className="font-body-sm text-body-sm font-semibold text-primary">
              {above === 0
                ? 'Governance: every company is at A0 (observe only)'
                : `Governance: ${above} compan${
                    above === 1 ? 'y' : 'ies'
                  } may draft; none may act unsupervised`}
            </span>
            <span className="font-label-sm text-label-sm text-outline">
              {above === 0
                ? 'Your specification caps any company without an accountable human owner, whatever its Brain score. Nothing can act until that is set.'
                : 'A1 permits drafting for review. Acting on an external system needs A2, which stays blocked until connectors, thresholds and a tested kill switch exist.'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Recommendation({
  icon,
  tone,
  title,
  detail,
}: {
  icon: string;
  tone: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="p-space-12 rounded-lg bg-surface-container-low flex items-start gap-space-8">
      <Icon name={icon} className={`${tone} text-[20px] mt-0.5 shrink-0`} />
      <div className="flex flex-col">
        <span className="font-body-md text-body-md font-semibold text-on-surface">{title}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{detail}</span>
      </div>
    </div>
  );
}
