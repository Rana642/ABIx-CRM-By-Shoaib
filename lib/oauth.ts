import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { pool } from './db';

// OAuth 2.1 for the MCP connector (see 33_MCP_OAUTH.sql). The console is its
// own authorisation server: public clients, PKCE S256, opaque tokens stored as
// hashes, refresh tokens rotated on every use.

export const BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://ai.sergeabi.com').replace(/\/+$/, '');
export const MCP_RESOURCE = `${BASE_URL}/mcp`;
export const SCOPE = 'onboarding';

const CODE_TTL_S = 300;
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_S = 60 * 24 * 3600;

// Only connector platforms may register a callback, so an arbitrary site
// cannot obtain a sign-in page that sends a code to itself.
const REDIRECT_HOSTS = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'claude.com'];

export const randomToken = (prefix: string) => prefix + randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const pkceMatches = (verifier: string, challenge: string) =>
  createHash('sha256').update(verifier).digest('base64url') === challenge;

export function redirectAllowed(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === 'https:' && REDIRECT_HOSTS.includes(u.hostname) && !u.hash;
  } catch {
    return false;
  }
}

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' };

export function oauthJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function oauthError(error: string, description: string, status = 400) {
  return oauthJson({ error, error_description: description }, status);
}

export type OAuthClient = { client_id: string; client_name: string | null; redirect_uris: string[] };

export async function findClient(clientId: string): Promise<OAuthClient | undefined> {
  if (!clientId) return undefined;
  const { rows } = await pool.query<OAuthClient>(
    'SELECT client_id, client_name, redirect_uris FROM abix.mcp_oauth_clients WHERE client_id = $1',
    [clientId]
  );
  return rows[0];
}

export async function issueCode(p: {
  clientId: string;
  username: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}): Promise<string> {
  const code = randomToken('aya_code_');
  await pool.query(
    `INSERT INTO abix.mcp_oauth_codes
       (code_hash, client_id, username, redirect_uri, code_challenge, scope, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))`,
    [sha256(code), p.clientId, p.username, p.redirectUri, p.codeChallenge, p.scope, p.resource, CODE_TTL_S]
  );
  return code;
}

export async function issueTokens(clientId: string, username: string, scope: string) {
  const access = randomToken('aya_at_');
  const refresh = randomToken('aya_rt_');
  await pool.query(
    `INSERT INTO abix.mcp_tokens (token_hash, kind, client_id, username, scope, expires_at) VALUES
       ($1, 'access',  $3, $4, $5, now() + make_interval(secs => $6)),
       ($2, 'refresh', $3, $4, $5, now() + make_interval(secs => $7))`,
    [sha256(access), sha256(refresh), clientId, username, scope, ACCESS_TTL_S, REFRESH_TTL_S]
  );
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: refresh,
    scope,
  };
}

export type TokenUser = { username: string; display_name: string; can_approve: boolean };

// The console user behind a bearer token, or null when there is no valid one.
export async function userFromBearer(req: Request): Promise<{ user: TokenUser | null; presented: boolean }> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return { user: null, presented: false };
  const { rows } = await pool.query<TokenUser>(
    `UPDATE abix.mcp_tokens t SET last_used_at = now()
       FROM abix.console_users u
      WHERE t.token_hash = $1 AND t.kind = 'access' AND t.revoked_at IS NULL
        AND t.expires_at > now() AND u.username = t.username
      RETURNING u.username, u.display_name, u.can_approve`,
    [sha256(m[1])]
  );
  return { user: rows[0] ?? null, presented: true };
}

// 401 that tells a connector where to discover how to sign in (RFC 9728).
export function unauthorized(presented: boolean) {
  const challenge = [
    `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`,
    `scope="${SCOPE}"`,
    ...(presented ? ['error="invalid_token"', 'error_description="The access token is invalid or expired"'] : []),
  ].join(', ');
  return new Response(
    JSON.stringify({ error: presented ? 'invalid_token' : 'unauthorized', error_description: 'Sign in to Aya to use this connector.' }),
    { status: 401, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': challenge, ...NO_STORE } }
  );
}
