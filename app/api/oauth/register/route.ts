import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { SCOPE, oauthError, oauthJson, randomToken, redirectAllowed } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// Dynamic client registration (RFC 7591). A connector registers itself once
// per connection. Clients are public (PKCE, no secret), and only connector
// platforms' callback addresses are accepted.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthError('invalid_client_metadata', 'The registration request must be JSON.');
  }

  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === 'string')
    : [];
  if (uris.length === 0 || uris.length > 10) {
    return oauthError('invalid_redirect_uri', 'Provide between one and ten redirect URIs.');
  }
  const refused = uris.filter((u) => !redirectAllowed(u));
  if (refused.length > 0) {
    return oauthError('invalid_redirect_uri', `This redirect URI is not allowed: ${refused[0]}`);
  }

  const clientId = randomToken('aya_client_').slice(0, 48);
  const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 120) : null;
  await pool.query(
    'INSERT INTO abix.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)',
    [clientId, name, uris]
  );

  return oauthJson(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(name ? { client_name: name } : {}),
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    },
    201
  );
}
