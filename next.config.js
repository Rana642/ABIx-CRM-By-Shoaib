/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // The MCP connector's public addresses: OAuth discovery documents at the
  // paths connectors look for, the sign-in and token endpoints, and /mcp.
  async rewrites() {
    return [
      { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/metadata' },
      { source: '/.well-known/oauth-authorization-server/:path*', destination: '/api/oauth/metadata' },
      { source: '/.well-known/openid-configuration', destination: '/api/oauth/metadata' },
      { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/resource' },
      { source: '/.well-known/oauth-protected-resource/:path*', destination: '/api/oauth/resource' },
      { source: '/oauth/:path*', destination: '/api/oauth/:path*' },
      { source: '/mcp', destination: '/api/mcp' },
    ];
  },
};

module.exports = nextConfig;
