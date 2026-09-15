'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Shell';
import { AyaLoader } from '../AyaLogo';
import { Card, MetricCard, NotConnected, SectionHeader } from '../ui';
import { formatCompact, formatInt, formatUsd } from '../format';

// Insights & Costs: what the agents' model calls use and cost (Serge, 12 Sept
// report: "Is there a way to keep track of the token usage?"). Everything on the
// screen is totalled from one /api/usage payload, so the figures always agree.

type Purpose = 'customer' | 'test' | 'internal';

type UsageRow = {
  day: string;
  purpose: Purpose;
  model: string;
  kind: 'chat' | 'audio';
  source_label: string | null;
  business_slug: string | null;
  business_name: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
};

type RunRow = { day: string; purpose: Purpose; business_slug: string | null; runs: number };

type Limit = {
  model: string;
  daily_token_limit: number;
  limit_note: string | null;
  tokens_24h: number;
  test_tokens_24h: number;
};

type Price = {
  model: string;
  kind: 'chat' | 'audio';
  input_usd_per_m: number | null;
  cached_input_usd_per_m: number | null;
  output_usd_per_m: number | null;
  audio_usd_per_hour: number | null;
  min_audio_seconds: number | null;
  price_source: string;
  as_of: string;
};

type Sync = {
  first_run_at: string | null;
  last_run_at: string | null;
  calls_added: number | null;
  last_error: string | null;
  last_error_at: string | null;
};

type Usage =
  | {
      available: true;
      as_of: string;
      today: string;
      sync: Sync | null;
      rows: UsageRow[];
      runs: RunRow[];
      limits: Limit[];
      prices: Price[];
      span: { first_call_at: string | null; last_call_at: string | null; calls: number };
    }
  | { available: false; reason: string };

type Range = '7d' | '30d' | 'month';

const RANGES: { key: Range; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
];

// Fixed order, never cycled: a colour belongs to its purpose, whatever is shown.
const SERIES: { key: Purpose; label: string; color: string }[] = [
  { key: 'customer', label: 'Customer messages', color: 'rgb(var(--c-viz-1))' },
  { key: 'test', label: 'Tests', color: 'rgb(var(--c-viz-2))' },
  { key: 'internal', label: 'Internal', color: 'rgb(var(--c-viz-3))' },
];

const PURPOSE_LABEL: Record<Purpose, string> = {
  customer: 'Customers',
  test: 'Tests',
  internal: 'Internal',
};

// The collector runs every 10 minutes; three missed runs means the figures are stale.
const STALE_MINUTES = 30;

// Status colours are fixed across themes and always shown with an icon and a label.
const STATUS = { warning: '#fab219', critical: '#d03b3b' };

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(day: string, weekday = false) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(weekday ? { weekday: 'short' } : {}),
  });
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function minutesSince(iso: string) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function ago(iso: string) {
  const m = minutesSince(iso);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

// List prices: $0.60, but $0.075 keeps its third decimal.
function price(n: number | null) {
  if (n === null) return '—';
  return `$${Number.isInteger(n * 100) ? n.toFixed(2) : n}`;
}

function modelName(model: string) {
  return model.replace(/^openai\//, '');
}

type DayTotals = Record<Purpose, number> & { cost: number };

function summarise(d: Extract<Usage, { available: true }>, range: Range) {
  const start =
    range === '7d' ? addDays(d.today, -6) : range === '30d' ? addDays(d.today, -29) : `${d.today.slice(0, 8)}01`;

  const days: string[] = [];
  for (let x = start; x <= d.today; x = addDays(x, 1)) days.push(x);

  const rows = d.rows.filter((r) => r.day >= start && r.day <= d.today);
  const runs = d.runs.filter((r) => r.day >= start && r.day <= d.today);

  const byDay = new Map<string, DayTotals>();
  for (const day of days) byDay.set(day, { customer: 0, test: 0, internal: 0, cost: 0 });

  const totals = { tokens: 0, input: 0, output: 0, cost: 0, calls: 0 };
  const customer = { tokens: 0, cost: 0, runs: 0 };
  const businesses = new Map<string, { name: string; runs: number; tokens: number; cost: number }>();
  const sources = new Map<string, { label: string; purpose: Purpose; calls: number; tokens: number; cost: number }>();
  const models = new Map<
    string,
    { model: string; kind: 'chat' | 'audio'; calls: number; input: number; output: number; cost: number }
  >();

  for (const r of rows) {
    const day = byDay.get(r.day);
    if (day) {
      day[r.purpose] += r.total_tokens;
      day.cost += r.cost_usd;
    }
    totals.tokens += r.total_tokens;
    totals.input += r.input_tokens;
    totals.output += r.output_tokens;
    totals.cost += r.cost_usd;
    totals.calls += r.calls;

    if (r.purpose === 'customer') {
      customer.tokens += r.total_tokens;
      customer.cost += r.cost_usd;
      const key = r.business_slug ?? '';
      const b = businesses.get(key) ?? {
        name: r.business_name ?? r.business_slug ?? 'Not identified',
        runs: 0,
        tokens: 0,
        cost: 0,
      };
      b.tokens += r.total_tokens;
      b.cost += r.cost_usd;
      businesses.set(key, b);
    }

    const sKey = `${r.purpose}|${r.source_label ?? ''}`;
    const s = sources.get(sKey) ?? {
      label: r.source_label ?? 'Unnamed workflow',
      purpose: r.purpose,
      calls: 0,
      tokens: 0,
      cost: 0,
    };
    s.calls += r.calls;
    s.tokens += r.total_tokens;
    s.cost += r.cost_usd;
    sources.set(sKey, s);

    const m = models.get(r.model) ?? { model: r.model, kind: r.kind, calls: 0, input: 0, output: 0, cost: 0 };
    m.calls += r.calls;
    m.input += r.input_tokens;
    m.output += r.output_tokens;
    m.cost += r.cost_usd;
    models.set(r.model, m);
  }

  for (const r of runs) {
    if (r.purpose !== 'customer') continue;
    customer.runs += r.runs;
    const b = businesses.get(r.business_slug ?? '');
    if (b) b.runs += r.runs;
  }

  return {
    days,
    byDay,
    totals,
    customer,
    series: SERIES.filter((s) => rows.some((r) => r.purpose === s.key)),
    businesses: Array.from(businesses.values()).sort((a, b) => b.tokens - a.tokens),
    sources: Array.from(sources.values()).sort((a, b) => b.tokens - a.tokens),
    models: Array.from(models.values()).sort((a, b) => b.cost - a.cost),
  };
}

export function Insights() {
  const [data, setData] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState<Range>('30d');
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    fetch('/api/usage')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const view = useMemo(() => (data && data.available ? summarise(data, range) : null), [data, range]);

  if (failed) {
    return (
      <NotConnected
        label="AI usage"
        icon="monitoring"
        reason="The usage figures could not be read. Reload the page; if it keeps failing, the database is unreachable."
      />
    );
  }
  if (!data) return <AyaLoader label="Reading AI usage…" />;
  if (!data.available || !view) {
    return <NotConnected label="AI usage" icon="monitoring" reason={data.available ? '' : data.reason} />;
  }

  const perMessageTokens = view.customer.runs > 0 ? view.customer.tokens / view.customer.runs : 0;
  const perMessageCost = view.customer.runs > 0 ? view.customer.cost / view.customer.runs : 0;
  const chat = data.prices.filter((p) => p.kind === 'chat');
  const audio = data.prices.find((p) => p.kind === 'audio');

  return (
    <div className="flex flex-col w-full gap-space-24">
      <Card className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-24">
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider">
            Insights &amp; Costs
          </span>
          <h1 className="font-headline-md text-headline-md text-primary text-balance">What the AI costs to run</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-4 max-w-[72ch]">
            Every model call the agents make (WhatsApp replies, voice-note transcription and tests), counted
            from n8n&apos;s own run records and priced at Groq&apos;s list prices.
          </p>
        </div>
        <SyncState sync={data.sync} />
      </Card>

      <div className="flex flex-wrap gap-space-8" role="group" aria-label="Period">
        {RANGES.map((r) => (
          <button
            key={r.key}
            id={`usage-range-${r.key}`}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
            className={`px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm transition-colors ${
              range === r.key
                ? 'bg-primary-container text-on-primary font-semibold'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-16">
        <MetricCard
          label="Tokens used"
          icon="data_usage"
          value={formatCompact(view.totals.tokens)}
          sub={
            <span className="font-body-sm text-body-sm text-outline">
              {formatCompact(view.totals.input)} read · {formatCompact(view.totals.output)} written
            </span>
          }
        />
        <MetricCard
          label="Estimated cost"
          icon="payments"
          value={formatUsd(view.totals.cost)}
          sub={<span className="font-body-sm text-body-sm text-outline">at Groq list prices</span>}
          footer={
            <span className="font-label-sm text-label-sm text-outline">
              Nothing is billed while Groq is on the free tier
            </span>
          }
        />
        <MetricCard
          label="Customer messages"
          icon="forum"
          value={formatInt(view.customer.runs)}
          sub={<span className="font-body-sm text-body-sm text-outline">handled with the model</span>}
        />
        <MetricCard
          label="Per customer message"
          icon="chat"
          value={view.customer.runs > 0 ? `${formatCompact(perMessageTokens)} tokens` : '—'}
          sub={
            <span className="font-body-sm text-body-sm text-outline">
              {view.customer.runs > 0 ? `about ${formatUsd(perMessageCost)} each` : 'no customer messages yet'}
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-16">
        <Card className="lg:col-span-2 min-w-0">
          <SectionHeader icon="bar_chart" title="Tokens per day" meta="Paris time">
            <button
              id="usage-chart-toggle"
              type="button"
              onClick={() => setAsTable((t) => !t)}
              className="font-label-sm text-label-sm px-space-12 py-space-4 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              {asTable ? 'Show chart' : 'Show table'}
            </button>
          </SectionHeader>
          {view.totals.tokens === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant py-space-24">
              No model calls in this period.
            </p>
          ) : asTable ? (
            <DailyTable days={view.days} byDay={view.byDay} series={view.series} />
          ) : (
            <DailyChart days={view.days} byDay={view.byDay} series={view.series} />
          )}
        </Card>

        <Card className="flex flex-col gap-space-16">
          <SectionHeader icon="speed" title="Daily allowance" meta="last 24 hours" />
          {data.limits.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              No daily limit is recorded for the models in use.
            </p>
          ) : (
            data.limits.map((l) => <Allowance key={l.model} limit={l} />)
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-16">
        <Card padded={false} className="overflow-hidden">
          <div className="p-space-20 pb-0">
            <SectionHeader icon="domain" title="By business" meta="customer messages" />
          </div>
          <Table
            head={['Business', 'Messages', 'Tokens', 'Est. cost']}
            empty="No customer messages in this period."
            rows={view.businesses.map((b) => [b.name, formatInt(b.runs), formatInt(b.tokens), formatUsd(b.cost)])}
          />
        </Card>
        <Card padded={false} className="overflow-hidden">
          <div className="p-space-20 pb-0">
            <SectionHeader icon="account_tree" title="By source" />
          </div>
          <Table
            head={['Workflow', 'Purpose', 'Model calls', 'Tokens', 'Est. cost']}
            empty="No model calls in this period."
            rows={view.sources.map((s) => [
              s.label,
              PURPOSE_LABEL[s.purpose],
              formatInt(s.calls),
              formatInt(s.tokens),
              formatUsd(s.cost),
            ])}
          />
        </Card>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="p-space-20 pb-0">
          <SectionHeader icon="memory" title="By model" />
        </div>
        <Table
          head={['Model', 'Calls', 'Tokens read', 'Tokens written', 'Est. cost']}
          empty="No model calls in this period."
          rows={view.models.map((m) => [
            m.kind === 'audio' ? `${modelName(m.model)} (voice notes)` : modelName(m.model),
            formatInt(m.calls),
            m.kind === 'audio' ? '—' : formatInt(m.input),
            m.kind === 'audio' ? '—' : formatInt(m.output),
            formatUsd(m.cost),
          ])}
        />
      </Card>

      <Card className="max-w-4xl">
        <SectionHeader icon="info" title="How this is counted" />
        <ul className="flex flex-col gap-space-8 font-body-sm text-body-sm text-on-surface-variant list-disc pl-space-20">
          <li>
            Copied from n8n&apos;s run records every 10 minutes and kept here permanently. n8n itself keeps
            its records for only 14 days
            {data.sync?.first_run_at && data.span.first_call_at && (
              <>
                , so the days before tracking began on {dateLabel(data.sync.first_run_at)} come from what it
                still held, which starts on {dateLabel(data.span.first_call_at)}
              </>
            )}
            .
          </li>
          <li>
            Groq&apos;s own console is the billing record. These figures are estimates at list prices:{' '}
            {chat
              .map(
                (p) =>
                  `${modelName(p.model)} ${price(p.input_usd_per_m)} per million tokens read, ${price(p.output_usd_per_m)} written`
              )
              .join('; ')}
            {audio &&
              `; voice notes ${price(audio.audio_usd_per_hour)} per hour of audio, each counted at Groq's ${audio.min_audio_seconds}-second minimum because n8n does not record their length`}
            {chat[0] && ` (${chat[0].price_source}, ${dateLabel(chat[0].as_of)})`}.
          </li>
          <li>
            One customer message can use the model more than once: first to work out which business it is
            about, then to answer it.
          </li>
          <li>Tests run on the same Groq account as customer replies, so they use the same daily allowance.</li>
        </ul>
      </Card>
    </div>
  );
}

function SyncState({ sync }: { sync: Sync | null }) {
  if (!sync || !sync.last_run_at) {
    return (
      <Pill icon="schedule" tone="muted">
        Not collected yet
      </Pill>
    );
  }
  const failedLast =
    sync.last_error && sync.last_error_at && new Date(sync.last_error_at) > new Date(sync.last_run_at);
  if (failedLast) {
    return (
      <Pill icon="error" tone="critical" title={sync.last_error ?? undefined}>
        Last update failed · figures from {ago(sync.last_run_at)}
      </Pill>
    );
  }
  if (minutesSince(sync.last_run_at) > STALE_MINUTES) {
    return (
      <Pill icon="warning" tone="warning">
        Stale · last updated {ago(sync.last_run_at)}
      </Pill>
    );
  }
  return (
    <Pill icon="sync" tone="ok">
      Updated {ago(sync.last_run_at)} · every 10 min
    </Pill>
  );
}

function Pill({
  icon,
  tone,
  title,
  children,
}: {
  icon: string;
  tone: 'ok' | 'muted' | 'warning' | 'critical';
  title?: string;
  children: React.ReactNode;
}) {
  const iconColor =
    tone === 'ok'
      ? 'text-secondary'
      : tone === 'muted'
        ? 'text-outline'
        : undefined;
  const style = tone === 'warning' ? { color: STATUS.warning } : tone === 'critical' ? { color: STATUS.critical } : undefined;
  return (
    <div
      title={title}
      className="flex items-center gap-space-8 px-space-12 py-space-8 rounded-lg bg-surface-container-low shrink-0 self-start lg:self-auto"
    >
      <Icon name={icon} className={`text-[18px] ${iconColor ?? ''}`} style={style} />
      <span className="font-body-sm text-body-sm text-on-surface">{children}</span>
    </div>
  );
}

function Allowance({ limit }: { limit: Limit }) {
  const pct = limit.daily_token_limit > 0 ? (limit.tokens_24h / limit.daily_token_limit) * 100 : 0;
  const level = pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : 'ok';
  const fill = level === 'ok' ? 'rgb(var(--c-secondary))' : STATUS[level];
  return (
    <div className="flex flex-col gap-space-8">
      <div className="flex items-baseline justify-between gap-space-8">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">{modelName(limit.model)}</span>
        <span className="font-body-sm text-body-sm text-outline tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div
        className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={limit.daily_token_limit}
        aria-valuenow={limit.tokens_24h}
        aria-label={`${modelName(limit.model)} tokens in the last 24 hours`}
      >
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: fill }} />
      </div>
      <span className="font-body-sm text-body-sm text-on-surface tabular-nums">
        {formatInt(limit.tokens_24h)} of {formatInt(limit.daily_token_limit)} tokens
        {limit.test_tokens_24h > 0 && (
          <span className="text-outline"> · {formatInt(limit.test_tokens_24h)} by tests</span>
        )}
      </span>
      {level !== 'ok' && (
        <span className="flex items-center gap-space-4 font-body-sm text-body-sm text-on-surface">
          <Icon name={level === 'critical' ? 'error' : 'warning'} className="text-[16px]" style={{ color: fill }} />
          {level === 'critical'
            ? 'Near the limit: replies may fail until the window rolls over'
            : 'Getting close to the daily limit'}
        </span>
      )}
      {limit.limit_note && (
        <p className="font-label-sm text-label-sm text-outline leading-relaxed">{limit.limit_note}</p>
      )}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) {
    return <p className="px-space-20 pb-space-20 font-body-sm text-body-sm text-on-surface-variant">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-sm font-body-sm">
        <thead>
          <tr className="bg-surface-container-low text-left">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-space-16 py-space-8 font-label-sm text-label-sm text-outline uppercase tracking-wider whitespace-nowrap ${
                  i > 0 ? 'text-right' : ''
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.join('|')} className="border-t border-outline-variant/20">
              {r.map((cell, i) => (
                <td
                  key={i}
                  className={`px-space-16 py-space-12 ${
                    i === 0 ? 'text-on-surface font-semibold' : 'text-on-surface-variant text-right tabular-nums whitespace-nowrap'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function niceStep(x: number) {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

function Legend({ series, totals }: { series: typeof SERIES; totals: Record<Purpose, number> }) {
  return (
    <div className="flex flex-wrap gap-x-space-20 gap-y-space-8 mb-space-12">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-space-8 font-body-sm text-body-sm text-on-surface-variant">
          <span className="h-2.5 w-2.5 rounded-[2px] shrink-0" style={{ background: s.color }} />
          {s.label}
          <span className="text-on-surface font-semibold tabular-nums">{formatCompact(totals[s.key])}</span>
        </span>
      ))}
    </div>
  );
}

function DailyChart({
  days,
  byDay,
  series,
}: {
  days: string[];
  byDay: Map<string, DayTotals>;
  series: typeof SERIES;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  // Measured from the card, never assumed: a fixed starting width would make
  // the chart, and with it the whole page, wider than a phone screen.
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    setWidth(Math.floor(el.clientWidth));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const M = { top: 12, right: 8, bottom: 28, left: 44 };
  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const stackTotals = days.map((d) => series.reduce((a, s) => a + (byDay.get(d)?.[s.key] ?? 0), 0));
  const max = Math.max(0, ...stackTotals);
  const step = niceStep(max / 4);
  const yMax = max > 0 ? Math.ceil(max / step) * step : 1;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax + step / 1000; v += step) ticks.push(v);

  const band = iw / days.length;
  const bw = Math.min(24, Math.max(2, band * 0.64));
  const y = (v: number) => M.top + ih - (v / yMax) * ih;
  const labelEvery = days.length <= 10 ? 1 : Math.ceil(days.length / 8);

  const legendTotals = { customer: 0, test: 0, internal: 0 } as Record<Purpose, number>;
  for (const d of days) for (const s of series) legendTotals[s.key] += byDay.get(d)?.[s.key] ?? 0;

  const activeDay = active !== null ? days[active] : null;
  const tipX = active !== null ? Math.min(Math.max(M.left + active * band + band / 2, 90), width - 90) : 0;

  return (
    <div>
      <Legend series={series} totals={legendTotals} />
      <div ref={wrap} className="relative w-full min-w-0" style={{ height: H }}>
        {width > 0 && (
        <svg width={width} height={H} className="block" role="img" aria-label="Tokens used per day, stacked by purpose">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(t)}
                y2={y(t)}
                stroke="rgb(var(--c-outline-variant))"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={M.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="rgb(var(--c-outline))"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatCompact(t)}
              </text>
            </g>
          ))}

          {days.map((day, i) => {
            const x0 = M.left + i * band;
            const bx = x0 + (band - bw) / 2;
            const values = series.map((s) => ({ s, v: byDay.get(day)?.[s.key] ?? 0 })).filter((e) => e.v > 0);
            let acc = 0;
            const t = byDay.get(day);
            const label = `${dayLabel(day, true)}: ${series
              .map((s) => `${s.label} ${formatInt(t?.[s.key] ?? 0)} tokens`)
              .join(', ')}`;
            return (
              <g
                key={day}
                tabIndex={0}
                aria-label={label}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((a) => (a === i ? null : a))}
                className="outline-none"
              >
                <rect
                  x={x0}
                  y={M.top}
                  width={band}
                  height={ih}
                  fill={active === i ? 'rgb(var(--c-surface-container-low))' : 'transparent'}
                />
                {values.map(({ s, v }, k) => {
                  const top = y(acc + v);
                  const bottom = y(acc);
                  acc += v;
                  // A 2px surface gap separates stacked segments.
                  const h = Math.max(1, bottom - top - (k > 0 ? 2 : 0));
                  if (k === values.length - 1) {
                    const r = Math.min(4, h / 2, bw / 2);
                    const d = `M${bx},${top + h} L${bx},${top + r} Q${bx},${top} ${bx + r},${top} L${bx + bw - r},${top} Q${bx + bw},${top} ${bx + bw},${top + r} L${bx + bw},${top + h} Z`;
                    return <path key={s.key} d={d} fill={s.color} />;
                  }
                  return <rect key={s.key} x={bx} y={top} width={bw} height={h} fill={s.color} />;
                })}
                {i % labelEvery === 0 && (
                  <text
                    x={x0 + band / 2}
                    y={H - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fill="rgb(var(--c-outline))"
                  >
                    {dayLabel(day)}
                  </text>
                )}
              </g>
            );
          })}

          <line
            x1={M.left}
            x2={width - M.right}
            y1={y(0)}
            y2={y(0)}
            stroke="rgb(var(--c-outline))"
            strokeOpacity={0.6}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        </svg>
        )}

        {activeDay && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-surface-container-lowest shadow-md border border-outline-variant/40 px-space-12 py-space-8 min-w-[160px]"
            style={{ left: tipX }}
          >
            <div className="font-label-sm text-label-sm text-outline mb-space-4">{dayLabel(activeDay, true)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-space-8 font-body-sm text-body-sm">
                <span className="h-0.5 w-3 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="font-semibold text-on-surface tabular-nums">
                  {formatInt(byDay.get(activeDay)?.[s.key] ?? 0)}
                </span>
                <span className="text-on-surface-variant">{s.label}</span>
              </div>
            ))}
            <div className="mt-space-4 pt-space-4 border-t border-outline-variant/40 font-body-sm text-body-sm text-on-surface-variant">
              Est. cost{' '}
              <span className="font-semibold text-on-surface tabular-nums">
                {formatUsd(byDay.get(activeDay)?.cost ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DailyTable({
  days,
  byDay,
  series,
}: {
  days: string[];
  byDay: Map<string, DayTotals>;
  series: typeof SERIES;
}) {
  const rows = [...days]
    .reverse()
    .filter((d) => series.some((s) => (byDay.get(d)?.[s.key] ?? 0) > 0))
    .map((d) => {
      const t = byDay.get(d)!;
      const total = series.reduce((a, s) => a + t[s.key], 0);
      return [dayLabel(d, true), ...series.map((s) => formatInt(t[s.key])), formatInt(total), formatUsd(t.cost)];
    });
  return (
    <div className="-mx-space-20 -mb-space-20">
      <Table
        head={['Day', ...series.map((s) => s.label), 'Total', 'Est. cost']}
        rows={rows}
        empty="No model calls in this period."
      />
    </div>
  );
}
