import { NextRequest } from 'next/server';
import { unauthorized, userFromBearer } from '@/lib/oauth';
import { INSTRUCTIONS, TOOLS, ToolError } from '@/lib/mcpTools';

export const dynamic = 'force-dynamic';

// The console's MCP server, served at /mcp over the streamable HTTP transport.
// Stateless: every request carries its bearer token and gets a JSON response —
// no session, no server-sent stream, which the transport allows.

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

type RpcId = string | number | null;

const reply = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const result = (id: RpcId, r: unknown) => reply({ jsonrpc: '2.0', id, result: r });
const rpcError = (id: RpcId, code: number, message: string) => reply({ jsonrpc: '2.0', id, error: { code, message } });

export async function POST(req: NextRequest) {
  const { user, presented } = await userFromBearer(req);
  if (!user) return unauthorized(presented);

  let msg: { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> };
  try {
    msg = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  if (Array.isArray(msg) || typeof msg !== 'object' || msg === null) {
    return rpcError(null, -32600, 'Send one JSON-RPC message per request.');
  }

  // Notifications (no id) and responses need no answer.
  if (msg.id === undefined || msg.id === null || !msg.method) {
    return new Response(null, { status: 202 });
  }
  const id = msg.id;

  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      return result(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'aya-console', title: 'Aya — ABIx console', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations,
        })),
      });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const out = await tool.run(args, user);
        return result(id, {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          structuredContent: out,
          isError: false,
        });
      } catch (e) {
        const message = e instanceof ToolError ? e.message : `Something went wrong: ${(e as Error).message}`;
        return result(id, { content: [{ type: 'text', text: message }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

// No server-initiated stream and no sessions to end.
export async function GET(req: NextRequest) {
  const { user, presented } = await userFromBearer(req);
  if (!user) return unauthorized(presented);
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
