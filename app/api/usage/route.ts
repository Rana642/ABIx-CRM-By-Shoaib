import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Token usage and estimated cost of every model call the agents make (Serge,
// 12 Sept report: "Is there a way to keep track of the token usage?").
//
// A collector on the VPS copies each call from n8n's own run records into
// abix.ai_model_calls every 10 minutes (aya-os-local/collectors/n8n_ai_usage.py).
// Prices and the free-tier allowance live in abix.ai_model_prices with their
// source and date. Rows come back per day and dimension for the last 90 days;
// the screen filters and totals them, so every figure on it agrees.
export async function GET() {
  try {
    const [sync, rows, runs, limits, prices, span] = await Promise.all([
      pool.query(`
        SELECT first_run_at, last_run_at, calls_added, last_error, last_error_at
        FROM abix.ai_usage_sync
        WHERE source = 'n8n'
      `),
      pool.query(`
        SELECT to_char(v.day_paris, 'YYYY-MM-DD')        AS day,
               v.purpose, v.model, v.kind, v.source_label,
               v.business_slug, c.name                   AS business_name,
               count(*)::int                             AS calls,
               sum(v.input_tokens)::float8               AS input_tokens,
               sum(v.output_tokens)::float8              AS output_tokens,
               sum(v.total_tokens)::float8               AS total_tokens,
               coalesce(sum(v.est_cost_usd), 0)::float8  AS cost_usd
        FROM abix.v_ai_model_calls_costed v
        LEFT JOIN public.companies c ON c.slug = v.business_slug
        WHERE v.day_paris >= (now() AT TIME ZONE 'Europe/Paris')::date - 89
        GROUP BY 1, 2, 3, 4, 5, 6, 7
        ORDER BY 1
      `),
      // One run is one message handled (or one test). Counted apart from the
      // rows above so a run that called two models is not counted twice.
      pool.query(`
        SELECT to_char(day_paris, 'YYYY-MM-DD')          AS day,
               purpose, business_slug,
               count(DISTINCT n8n_execution_id)::int     AS runs
        FROM abix.v_ai_model_calls_costed
        WHERE day_paris >= (now() AT TIME ZONE 'Europe/Paris')::date - 89
        GROUP BY 1, 2, 3
      `),
      pool.query(`
        SELECT p.model,
               p.daily_token_limit::float8                AS daily_token_limit,
               p.limit_note,
               coalesce(sum(v.total_tokens), 0)::float8   AS tokens_24h,
               coalesce(sum(v.total_tokens) FILTER (WHERE v.purpose = 'test'), 0)::float8
                                                          AS test_tokens_24h
        FROM abix.ai_model_prices p
        LEFT JOIN abix.v_ai_model_calls_costed v
               ON v.model = p.model AND v.called_at > now() - interval '24 hours'
        WHERE p.daily_token_limit IS NOT NULL
        GROUP BY p.model, p.daily_token_limit, p.limit_note
        ORDER BY p.model
      `),
      pool.query(`
        SELECT model, kind,
               input_usd_per_m::float8        AS input_usd_per_m,
               cached_input_usd_per_m::float8 AS cached_input_usd_per_m,
               output_usd_per_m::float8       AS output_usd_per_m,
               audio_usd_per_hour::float8     AS audio_usd_per_hour,
               min_audio_seconds::float8      AS min_audio_seconds,
               price_source,
               to_char(as_of, 'YYYY-MM-DD')   AS as_of
        FROM abix.ai_model_prices
        ORDER BY kind, model
      `),
      pool.query(`
        SELECT min(called_at) AS first_call_at,
               max(called_at) AS last_call_at,
               count(*)::int  AS calls,
               to_char((now() AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS today
        FROM abix.ai_model_calls
      `),
    ]);

    const s = span.rows[0];
    return NextResponse.json({
      available: true,
      as_of: new Date().toISOString(),
      today: s.today,
      sync: sync.rows[0] ?? null,
      rows: rows.rows,
      runs: runs.rows,
      limits: limits.rows,
      prices: prices.rows,
      span: { first_call_at: s.first_call_at, last_call_at: s.last_call_at, calls: s.calls },
    });
  } catch (err) {
    // 42P01: the usage tables are not installed in this database yet.
    if ((err as { code?: string }).code === '42P01') {
      return NextResponse.json({
        available: false,
        reason: 'Usage tracking is not installed in this database yet.',
      });
    }
    throw err;
  }
}
