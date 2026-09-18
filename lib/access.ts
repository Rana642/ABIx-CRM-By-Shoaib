import { NextRequest, NextResponse } from 'next/server';
import { pool } from './db';

// Permission checks for the console's API (Users & Access, 44_ACCESS.sql). The database decides;
// these helpers ask it and turn a refusal into a 403 that is also recorded. The same functions
// guard the database writes themselves, so skipping a helper cannot skip the rule.

export class AccessDenied extends Error {}

// Set by middleware.ts from the session, so the browser cannot choose it.
export function actorOf(req: NextRequest): string {
  return req.headers.get('x-console-user') ?? '';
}

export async function can(user: string, permission: string, companyId: string | null): Promise<boolean> {
  if (!user) return false;
  const { rows } = await pool.query('SELECT abix.fn_access_can($1, $2, $3::uuid) AS ok', [user, permission, companyId]);
  return rows[0]?.ok === true;
}

export async function recordDenied(user: string, what: string, permission: string | null, companyId: string | null,
                                   detail: Record<string, unknown> = {}) {
  await pool
    .query('SELECT abix.fn_access_log($1, $2, NULL, $3::uuid, $4, $5, $6::jsonb)', [
      user || 'anonymous', what, companyId, permission, 'denied', JSON.stringify(detail),
    ])
    .catch(() => undefined);
}

// Throws AccessDenied (recorded) unless the person may do this.
export async function requireAccess(user: string, permission: string, companyId: string | null, what: string) {
  if (await can(user, permission, companyId)) return;
  await recordDenied(user, what, permission, companyId);
  throw new AccessDenied(`Your access does not allow this (${what}).`);
}

export async function visibleCompanyIds(user: string): Promise<string[]> {
  if (!user) return [];
  const { rows } = await pool.query('SELECT w::text AS id FROM abix.fn_access_workspaces($1) w', [user]);
  return rows.map((r) => r.id);
}

export async function me(user: string) {
  const { rows } = await pool.query('SELECT abix.fn_access_me($1) AS me', [user]);
  return rows[0]?.me ?? null;
}

export function denied(message = 'Your access does not allow this.') {
  return NextResponse.json({ error: message }, { status: 403 });
}

// Wraps a route handler: AccessDenied becomes a 403, and a database refusal (FORBIDDEN) too.
export function guarded<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (e instanceof AccessDenied) return denied(msg);
      if (msg.startsWith('FORBIDDEN:')) return denied('Your access does not allow this.');
      throw e;
    }
  };
}
