import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { SCOPE, issueTokens, oauthError, oauthJson, pkceMatches, sha256 } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

async function readBody(req: NextRequest): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(j)) if (typeof v === 'string') out[k] = v;
  } else {
    const f = await req.formData().catch(() => null);
    f?.forEach((v, k) => {
      if (typeof v === 'string') out[k] = v;
    });
  }
  return out;
}

// Token endpoint: exchanges a one-time code (with its PKCE verifier) or a
// refresh token for a fresh access token. Refresh tokens rotate on every use.
export async function POST(req: NextRequest) {
  const b = await readBody(req);

  if (b.grant_type === 'authorization_code') {
    if (!b.code || !b.redirect_uri || !b.client_id || !b.code_verifier) {
      return oauthError('invalid_request', 'code, redirect_uri, client_id and code_verifier are required.');
    }
    // The code is spent on first presentation, whatever happens next.
    const { rows } = await pool.query(
      `UPDATE abix.mcp_oauth_codes SET used_at = now()
        WHERE code_hash = $1 AND used_at IS NULL
        RETURNING client_id, username, redirect_uri, code_challenge, scope, expires_at > now() AS fresh`,
      [sha256(b.code)]
    );
    const c = rows[0];
    if (!c || !c.fresh) return oauthError('invalid_grant', 'The authorization code is invalid, expired or already used.');
    if (c.client_id !== b.client_id || c.redirect_uri !== b.redirect_uri) {
      return oauthError('invalid_grant', 'The code was issued to a different client or redirect URI.');
    }
    if (!pkceMatches(b.code_verifier, c.code_challenge)) {
      return oauthError('invalid_grant', 'The code verifier does not match.');
    }
    return oauthJson(await issueTokens(c.client_id, c.username, c.scope || SCOPE));
  }

  if (b.grant_type === 'refresh_token') {
    if (!b.refresh_token) return oauthError('invalid_request', 'refresh_token is required.');
    const { rows } = await pool.query(
      `UPDATE abix.mcp_tokens SET revoked_at = now()
        WHERE token_hash = $1 AND kind = 'refresh' AND revoked_at IS NULL AND expires_at > now()
        RETURNING client_id, username, scope`,
      [sha256(b.refresh_token)]
    );
    const t = rows[0];
    if (!t || (b.client_id && b.client_id !== t.client_id)) {
      return oauthError('invalid_grant', 'The refresh token is invalid, expired or already used.');
    }
    return oauthJson(await issueTokens(t.client_id, t.username, t.scope || SCOPE));
  }

  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}
