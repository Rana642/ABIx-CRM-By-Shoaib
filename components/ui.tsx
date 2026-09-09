'use client';

import { Icon } from './Shell';

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`bg-surface-container-lowest rounded-xl shadow-sm ${
        padded ? 'p-space-20' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  meta,
  children,
}: {
  icon: string;
  title: string;
  meta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-space-16 gap-space-16">
      <div className="flex items-center gap-space-8 min-w-0">
        <Icon name={icon} className="text-primary text-[20px]" />
        <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
        {meta && <span className="font-body-sm text-body-sm text-outline">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  icon,
  value,
  sub,
  footer,
  progress,
  tone = 'default',
}: {
  label: string;
  icon: string;
  value: string | number;
  sub?: React.ReactNode;
  footer?: React.ReactNode;
  progress?: number;
  tone?: 'default' | 'alert';
}) {
  return (
    <Card className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-space-8">
          <span className="font-label-sm text-label-sm text-outline uppercase font-semibold">
            {label}
          </span>
          <Icon
            name={icon}
            className={`text-[18px] ${tone === 'alert' ? 'text-error' : 'text-secondary'}`}
          />
        </div>
        <div className="mt-space-12 flex items-baseline gap-space-8">
          <span className="font-tabular-metric text-tabular-metric text-primary font-bold tabular-nums">
            {value}
          </span>
        </div>
        {sub && <div className="flex items-center gap-space-4 mt-space-4">{sub}</div>}
      </div>
      {(footer || progress !== undefined) && (
        <div className="mt-space-16 pt-space-12 flex items-center justify-between gap-space-8 bg-surface-container-low -mx-space-20 -mb-space-20 px-space-20 py-space-8 rounded-b-xl">
          {progress !== undefined ? (
            <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-secondary h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
          ) : (
            footer
          )}
        </div>
      )}
    </Card>
  );
}

// Used wherever the design shows a figure we have no source for.
// 07_CEO_COMMAND_CENTER.yaml: never display unavailable data as current.
export function NotConnected({
  label,
  icon,
  reason,
}: {
  label: string;
  icon: string;
  reason: string;
}) {
  return (
    <Card className="flex flex-col justify-between border border-dashed border-outline-variant">
      <div>
        <div className="flex items-center justify-between gap-space-8">
          <span className="font-label-sm text-label-sm text-outline uppercase font-semibold">
            {label}
          </span>
          <Icon name={icon} className="text-outline text-[18px]" />
        </div>
        <div className="mt-space-12 flex items-baseline gap-space-8">
          <span className="font-tabular-metric text-tabular-metric text-outline font-bold">—</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-4">{reason}</p>
      </div>
      <div className="mt-space-16 pt-space-12 bg-surface-container-low -mx-space-20 -mb-space-20 px-space-20 py-space-8 rounded-b-xl">
        <span className="font-label-sm text-label-sm text-outline uppercase">No source connected</span>
      </div>
    </Card>
  );
}

export function AuthorityBadge({ level, capped }: { level: string; capped?: boolean }) {
  const tone: Record<string, string> = {
    A0: 'bg-surface-container text-on-surface-variant',
    A1: 'bg-primary-fixed text-on-primary-fixed',
    A2: 'bg-surface-container-high text-on-surface',
    A3: 'bg-secondary-container text-on-secondary-container',
    A4: 'bg-primary text-on-primary',
  };
  return (
    <span
      className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded font-semibold tabular-nums ${
        tone[level] ?? tone.A0
      }`}
      title={capped ? 'Capped below the level the Brain score allows' : undefined}
    >
      {level}
      {capped && ' · capped'}
    </span>
  );
}

const STATE_TONE: Record<string, string> = {
  not_started: 'bg-surface-container text-on-surface-variant',
  in_progress: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  brain_ready: 'bg-secondary-container text-on-secondary-container',
  live: 'bg-secondary text-on-secondary',
  paused: 'bg-error-container text-on-error-container',
};

const STATE_DOT: Record<string, string> = {
  not_started: 'bg-outline',
  in_progress: 'bg-tertiary',
  brain_ready: 'bg-secondary',
  live: 'bg-on-secondary',
  paused: 'bg-error',
};

export function StateChip({ state, label }: { state: string; label: string }) {
  return (
    <span
      className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded-full font-semibold flex items-center gap-1 whitespace-nowrap ${
        STATE_TONE[state] ?? STATE_TONE.not_started
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state] ?? STATE_DOT.not_started}`} />
      {label}
    </span>
  );
}

// Sections whose engine has not been built yet. Names what is missing and what
// has to exist first, so the screen is informative rather than a dead end.
export function ComingSoon({
  icon,
  title,
  what,
  blockedBy,
}: {
  icon: string;
  title: string;
  what: string;
  blockedBy: string[];
}) {
  return (
    <Card className="max-w-3xl">
      <div className="flex items-start gap-space-16">
        <div className="h-10 w-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
          <Icon name={icon} className="text-outline text-[22px]" />
        </div>
        <div className="flex flex-col gap-space-12 min-w-0">
          <div>
            <div className="flex items-center gap-space-8">
              <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
              <span className="font-label-sm text-label-sm px-space-8 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-semibold uppercase tracking-wider">
                Not built yet
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant mt-space-4">{what}</p>
          </div>
          <div className="bg-surface-container-low rounded-lg p-space-16">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
              Needs first
            </span>
            <ul className="mt-space-8 flex flex-col gap-space-8">
              {blockedBy.map((b) => (
                <li key={b} className="flex items-start gap-space-8 font-body-sm text-body-sm">
                  <Icon name="pending" className="text-outline text-[16px] mt-0.5 shrink-0" />
                  <span className="text-on-surface-variant">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}
