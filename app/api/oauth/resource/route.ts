import { BASE_URL, MCP_RESOURCE, SCOPE, oauthJson } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// Protected resource metadata (RFC 9728), served at
// /.well-known/oauth-protected-resource: the MCP server and who signs it in.
export function GET() {
  return oauthJson({
    resource: MCP_RESOURCE,
    authorization_servers: [BASE_URL],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Aya — ABIx console',
  });
}
