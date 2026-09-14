import { BASE_URL, SCOPE, oauthJson } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// Authorisation server metadata (RFC 8414), served at
// /.well-known/oauth-authorization-server (and openid-configuration).
export function GET() {
  return oauthJson({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    registration_endpoint: `${BASE_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
    service_documentation: BASE_URL,
  });
}
