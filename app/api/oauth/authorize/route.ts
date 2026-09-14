import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { checkConsolePassword } from '@/lib/consoleAuth';
import { BASE_URL, MCP_RESOURCE, SCOPE, findClient, issueCode, type OAuthClient } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

// The sign-in page a connector sends Serge to. He signs in with his console
// login; the connector gets a one-time code, never the password.

const KEYS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'state',
  'scope',
  'resource',
  'code_challenge',
  'code_challenge_method',
] as const;
type Params = Record<(typeof KEYS)[number], string>;

function read(src: { get(name: string): unknown }): Params {
  const p = {} as Params;
  for (const k of KEYS) {
    const v = src.get(k);
    p[k] = typeof v === 'string' ? v : '';
  }
  return p;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'",
};

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;
       background:#0B1220;color:#E2E8F0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
  main{width:100%;max-width:400px;background:#111a2e;border:1px solid #1f2b45;border-radius:14px;padding:28px}
  .mark{font:600 13px/1 system-ui;letter-spacing:.14em;text-transform:uppercase;color:#00E5D1;margin-bottom:14px}
  h1{font-size:21px;line-height:1.3;margin:0 0 10px}
  p{margin:0 0 16px;color:#94A3B8}
  label{display:block;font-size:13px;color:#94A3B8;margin:14px 0 6px}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:9px;border:1px solid #2a3a5c;
        background:#0B1220;color:#E2E8F0;font:inherit}
  input:focus{outline:2px solid #00E5D1;outline-offset:1px}
  button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:9px;background:#00E5D1;color:#0B1220;
         font:600 15px system-ui;cursor:pointer}
  button:focus-visible{outline:2px solid #E2E8F0;outline-offset:2px}
  .err{background:#3a1e1b;color:#f4c7c2;border-radius:9px;padding:10px 12px;margin:0 0 6px;font-size:14px}
  small{display:block;margin-top:16px;color:#64748b;font-size:12.5px}
</style></head><body><main><div class="mark">Aya · ABIx AI OS</div>${body}</main></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

function problem(message: string) {
  return page('Connection not recognised', `<h1>This connection cannot continue</h1><p>${esc(message)}</p>`, 400);
}

function redirectTo(uri: string, params: Record<string, string>) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

async function check(p: Params): Promise<{ client?: OAuthClient; response?: Response }> {
  const client = await findClient(p.client_id);
  if (!client) {
    return { response: problem('This connection request is not recognised. Start the connection again from ChatGPT.') };
  }
  if (!client.redirect_uris.includes(p.redirect_uri)) {
    return { response: problem('The return address in this request does not match the one this connector registered.') };
  }
  const deny = (error: string, description: string) => ({
    response: redirectTo(p.redirect_uri, { error, error_description: description, state: p.state, iss: BASE_URL }),
  });
  if (p.response_type !== 'code') return deny('unsupported_response_type', 'Only the authorization code flow is supported.');
  if (p.code_challenge_method !== 'S256' || !p.code_challenge) {
    return deny('invalid_request', 'PKCE with S256 is required.');
  }
  if (p.resource && p.resource !== MCP_RESOURCE && p.resource !== BASE_URL) {
    return deny('invalid_target', 'Unknown resource.');
  }
  return { client };
}

function form(p: Params, client: OAuthClient, error?: string, username = '') {
  const who = client.client_name ? esc(client.client_name) : 'An app';
  const hidden = KEYS.map((k) => `<input type="hidden" name="${k}" value="${esc(p[k])}">`).join('');
  return page(
    'Connect to Aya',
    `<h1>${who} wants to connect to Aya</h1>
     <p>It will read the onboarding records of your businesses and save answers you give it. What it saves
        waits for your approval, and nothing reaches customers until it is published from the console.</p>
     ${error ? `<div class="err" role="alert">${esc(error)}</div>` : ''}
     <form method="post" action="/oauth/authorize">${hidden}
       <label for="username">Console username</label>
       <input id="username" name="username" autocomplete="username" required value="${esc(username)}">
       <label for="password">Password</label>
       <input id="password" name="password" type="password" autocomplete="current-password" required>
       <button type="submit">Allow access</button>
     </form>
     <small>You can disconnect it at any time from the connector's settings.</small>`
  );
}

export async function GET(req: NextRequest) {
  const p = read(req.nextUrl.searchParams);
  const { client, response } = await check(p);
  if (response) return response;
  return form(p, client!);
}

export async function POST(req: NextRequest) {
  const data = await req.formData();
  const p = read(data);
  const { client, response } = await check(p);
  if (response) return response;

  const username = String(data.get('username') ?? '').trim();
  const password = String(data.get('password') ?? '');
  const known = await pool.query('SELECT 1 FROM abix.console_users WHERE username = $1', [username]);
  if (known.rowCount !== 1 || !(await checkConsolePassword(username, password))) {
    // A pause on every failure keeps guessing slow.
    await new Promise((r) => setTimeout(r, 800));
    return form(p, client!, 'That username and password did not match.', username);
  }

  const code = await issueCode({
    clientId: client!.client_id,
    username,
    redirectUri: p.redirect_uri,
    codeChallenge: p.code_challenge,
    scope: p.scope || SCOPE,
    resource: p.resource || MCP_RESOURCE,
  });
  return redirectTo(p.redirect_uri, { code, state: p.state, iss: BASE_URL });
}
