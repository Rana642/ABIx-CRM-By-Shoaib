import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { can, denied, me as accessMe, recordDenied } from '@/lib/access';

export const dynamic = 'force-dynamic';

// The team's WhatsApp inbox (T8): read conversations, take one over from the agent, reply,
// hand it back, and pause agents in an emergency. The rules live in the database functions
// from 40_WHATSAPP_INBOX.sql. Replies go out through the n8n workflow AYA_Inbox_Send, so the
// console never holds the WhatsApp token.

const SEND_URL = process.env.INBOX_SEND_URL ?? 'http://n8n:5678/webhook/aya-inbox-send';

// Set by middleware.ts after the password check, so the browser cannot choose it.
function actorOf(req: NextRequest): string {
  return req.headers.get('x-console-user') ?? '';
}

type SendTarget = { conversation_id: string; line: string; phone: string };

// Sends a WhatsApp text through AYA_Inbox_Send and logs it as the person's message.
// Returns an error sentence, or null when it went out.
async function sendAsPerson(c: SendTarget, text: string, actor: string): Promise<string | null> {
  if (!process.env.INBOX_SEND_SECRET) return 'Sending from the console is not configured yet.';
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Aya-Inbox-Secret': process.env.INBOX_SEND_SECRET },
    body: JSON.stringify({ line: c.line, to: c.phone, text }),
  });
  const sent = await res.json().catch(() => ({ ok: false, error: `The sending service answered ${res.status}.` }));
  if (!sent.ok) return sent.error ?? 'WhatsApp did not accept the message.';
  await pool.query('SELECT abix.fn_message_log($1::jsonb)', [
    JSON.stringify({
      conversation_id: c.conversation_id, direction: 'out', sender: 'person', sender_name: actor,
      kind: 'text', body: text, wa_message_id: sent.wa_message_id,
    }),
  ]);
  return null;
}

// Database errors meant for the person carry a CODE: prefix; show the sentence after it.
function friendly(message: string): string {
  const m = /^[A-Z_]+: ([\s\S]+)$/.exec(message);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.' : `Something went wrong: ${message}`;
}

export async function GET(req: NextRequest) {
  const actor = actorOf(req);
  const conversationId = req.nextUrl.searchParams.get('conversation_id');
  if (conversationId) {
    // Only a conversation of a workspace the person may see (Users & Access).
    const owner = await pool.query('SELECT abix.fn_conversation_company($1)::text AS company_id', [conversationId]);
    const companyId = owner.rows[0]?.company_id ?? null;
    if (!(await can(actor, companyId ? 'inbox.view' : 'portfolio.view', companyId))) {
      await recordDenied(actor, 'read a conversation', 'inbox.view', companyId, { conversation_id: conversationId });
      return denied();
    }
    const { rows } = await pool.query(
      `SELECT message_id, direction, sender, sender_name, kind, body, created_at
       FROM abix.whatsapp_messages
       WHERE conversation_id = $1
       ORDER BY created_at, message_id
       LIMIT 500`,
      [conversationId]
    );
    return NextResponse.json({ messages: rows });
  }

  const [conversations, pauses, businesses, meRow] = await Promise.all([
    pool.query(
      `SELECT w.conversation_id, w.channel_phone_number_id AS line, w.customer_phone AS phone,
              w.customer_name, w.status, w.handled_by, w.handler_name, w.started_at, w.last_inbound_at,
              w.metadata->'route'->>'area_label' AS area, w.metadata->'route'->>'enquiry_label' AS enquiry,
              w.metadata->'route'->>'company_slug' AS company_slug,
              abix.fn_conversation_company(w.conversation_id) AS company_id,
              w.last_inbound_at > now() - interval '24 hours' AS window_open,
              lm.body AS last_body, lm.sender AS last_sender, coalesce(lm.created_at, w.last_inbound_at) AS last_at
       FROM abix.whatsapp_conversations w
       LEFT JOIN LATERAL (
         SELECT body, sender, created_at FROM abix.whatsapp_messages m
         WHERE m.conversation_id = w.conversation_id ORDER BY message_id DESC LIMIT 1
       ) lm ON true
       WHERE w.last_inbound_at > now() - interval '14 days'
         -- Only conversations of workspaces the person may read; unrouted ones need portfolio-wide access.
         AND CASE WHEN abix.fn_conversation_company(w.conversation_id) IS NULL
                  THEN abix.fn_access_can($1, 'portfolio.view', NULL)
                  ELSE abix.fn_access_can($1, 'inbox.view', abix.fn_conversation_company(w.conversation_id)) END
       ORDER BY last_at DESC
       LIMIT 100`,
      [actor]
    ),
    pool.query(
      `SELECT p.pause_id, p.scope, p.scope_key, p.reason, p.paused_by, p.paused_at
       FROM abix.agent_pauses p
       LEFT JOIN public.companies pc ON p.scope = 'business' AND pc.slug = p.scope_key
       WHERE p.lifted_at IS NULL
         AND (p.scope <> 'business' OR pc.id IN (SELECT abix.fn_access_workspaces($1)))
       ORDER BY p.paused_at`,
      [actor]
    ),
    // The businesses the menu routes to — the ones a business-level pause can target.
    pool.query(
      `SELECT slug, name FROM public.companies
       WHERE slug IN ('clif', 'abix-properties', 'abix-portfolio-office', 'serge-abi-personal-brand')
         AND abix.fn_access_can($1, 'agents.pause', id)
       ORDER BY name`,
      [actor]
    ),
    // The name the customer sees when this person takes a conversation over.
    pool.query('SELECT display_name FROM abix.console_users WHERE username = $1', [actorOf(req)]),
  ]);
  return NextResponse.json({
    me: actorOf(req),
    me_name: meRow.rows[0]?.display_name ?? actorOf(req).split('@')[0],
    // What the person may do, per workspace, so the screen shows only allowed controls.
    access: await accessMe(actor),
    conversations: conversations.rows,
    pauses: pauses.rows,
    businesses: businesses.rows,
  });
}

export async function POST(req: NextRequest) {
  const actor = actorOf(req);
  if (!actor) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  try {
    switch (body.action) {
      case 'take':
      case 'return': {
        const { rows } = await pool.query('SELECT abix.fn_conversation_handle($1::jsonb) AS c', [
          JSON.stringify({ conversation_id: body.conversation_id, action: body.action, by: actor }),
        ]);
        const c = rows[0].c;
        // Taking over can tell the customer a person from the team is now here, so they do not
        // repeat themselves. Only within WhatsApp's 24-hour window.
        const intro = body.action === 'take' ? String(body.intro ?? '').trim() : '';
        if (intro) {
          const open = await pool.query(
            `SELECT last_inbound_at > now() - interval '24 hours' AS open FROM abix.whatsapp_conversations
             WHERE conversation_id = $1`,
            [c.conversation_id]
          );
          if (!open.rows[0]?.open) {
            return NextResponse.json({
              conversation: c,
              warning: 'Taken over. The message was not sent: the customer’s last message is more than 24 hours old.',
            });
          }
          const err = await sendAsPerson(
            { conversation_id: c.conversation_id, line: c.channel_phone_number_id, phone: c.customer_phone },
            intro, actor
          );
          if (err) return NextResponse.json({ conversation: c, warning: `Taken over, but the message was not sent: ${err}` });
        }
        return NextResponse.json({ conversation: c });
      }

      case 'pause':
      case 'resume': {
        const { rows } = await pool.query('SELECT abix.fn_agent_pause($1::jsonb) AS p', [
          JSON.stringify({
            action: body.action, scope: body.scope, key: body.key, reason: body.reason,
            pause_id: body.pause_id, by: actor,
          }),
        ]);
        return NextResponse.json({ pause: rows[0].p });
      }

      case 'send': {
        const text = String(body.text ?? '').trim();
        if (!text) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
        const { rows } = await pool.query(
          `SELECT conversation_id, channel_phone_number_id AS line, customer_phone AS phone, handled_by,
                  handler_name, last_inbound_at > now() - interval '24 hours' AS window_open
           FROM abix.whatsapp_conversations WHERE conversation_id = $1`,
          [body.conversation_id]
        );
        const c = rows[0];
        if (!c) return NextResponse.json({ error: 'This conversation no longer exists.' }, { status: 404 });
        const owner = await pool.query('SELECT abix.fn_conversation_company($1)::text AS company_id', [c.conversation_id]);
        const companyId = owner.rows[0]?.company_id ?? null;
        if (!(await can(actor, 'inbox.reply', companyId))) {
          await recordDenied(actor, 'reply to a conversation', 'inbox.reply', companyId, { conversation_id: c.conversation_id });
          return denied();
        }
        // Replying without taking over would let the agent answer on top of the person.
        if (c.handled_by !== 'person' || c.handler_name !== actor) {
          return NextResponse.json({ error: 'Take the conversation over before replying.' }, { status: 409 });
        }
        if (!c.window_open) {
          return NextResponse.json(
            {
              error:
                'WhatsApp allows a free reply only within 24 hours of the customer’s last message. ' +
                'This one needs an approved template.',
            },
            { status: 409 }
          );
        }
        const err = await sendAsPerson(c, text, actor);
        if (err) return NextResponse.json({ error: err }, { status: 502 });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: friendly(msg) }, { status: msg.startsWith('FORBIDDEN:') ? 403 : 400 });
  }
}
