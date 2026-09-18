'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Shell';
import { Card } from '../ui';

// The team's WhatsApp inbox (T8): every conversation the agent has, the whole exchange, and
// the controls to take one over, reply, hand it back — plus the emergency stop.

type Conversation = {
  conversation_id: string;
  line: string;
  phone: string;
  customer_name: string | null;
  status: string;
  handled_by: 'agent' | 'person';
  handler_name: string | null;
  area: string | null;
  enquiry: string | null;
  company_slug: string | null;
  company_id: string | null;
  window_open: boolean;
  last_body: string | null;
  last_sender: string | null;
  last_at: string;
};

type Message = {
  message_id: number;
  direction: 'in' | 'out';
  sender: 'customer' | 'agent' | 'person' | 'system';
  sender_name: string | null;
  kind: string;
  body: string | null;
  created_at: string;
};

type Pause = { pause_id: string; scope: 'all' | 'line' | 'business'; scope_key: string | null; reason: string | null; paused_by: string; paused_at: string };
type Business = { slug: string; name: string };
// What the signed-in person may do (Users & Access); the API and database enforce the same rules.
type Access = {
  is_owner: boolean;
  pause_all: boolean;
  workspaces: { company_id: string; permissions: string[] | null }[];
};

const POLL_MS = 5000;

// Who the customer is told they are now speaking to, by the business the menu routed them to.
const TEAM: Record<string, string> = {
  clif: 'the Come Live in France team',
  'abix-properties': "Serge's property team",
  'abix-portfolio-office': 'the ABIx Group team',
  'serge-abi-personal-brand': "Serge Abi's team",
};

function introFor(c: Conversation, meName: string) {
  const first = (c.customer_name ?? '').trim().split(/\s+/)[0];
  const me = meName.trim().split(/\s+/)[0] || meName;
  const team = TEAM[c.company_slug ?? ''] ?? "Serge Abi's team";
  return `Hi${first ? ' ' + first : ''}, this is ${me} from ${team}, a real person taking over from Aya. ` +
    'Give me 3–5 minutes to read through our conversation, so you won’t need to repeat anything.';
}

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function who(c: Conversation) {
  return c.customer_name || `+${c.phone}`;
}

async function post(body: object): Promise<{ error?: string; warning?: string }> {
  const r = await fetch('/api/inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ error: `The console answered ${r.status}.` }));
}

export function Inbox() {
  const [me, setMe] = useState('');
  const [meName, setMeName] = useState('');
  const [access, setAccess] = useState<Access | null>(null);
  // The message sent when taking over; null while the take-over panel is closed.
  const [intro, setIntro] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const d = await fetch('/api/inbox').then((r) => r.json());
    setMe(d.me ?? '');
    setMeName(d.me_name ?? d.me ?? '');
    setAccess(d.access ?? null);
    setConversations(d.conversations ?? []);
    setPauses(d.pauses ?? []);
    setBusinesses(d.businesses ?? []);
    setLoaded(true);
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const d = await fetch(`/api/inbox?conversation_id=${id}`).then((r) => r.json());
    setMessages(d.messages ?? []);
  }, []);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!openId) return;
    loadMessages(openId);
    const t = setInterval(() => loadMessages(openId), POLL_MS);
    return () => clearInterval(t);
  }, [openId, loadMessages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // A take-over message belongs to one conversation: opening another closes the panel.
  useEffect(() => setIntro(null), [openId]);

  const open = conversations.find((c) => c.conversation_id === openId) ?? null;
  const mine = !!open && open.handled_by === 'person' && open.handler_name === me;
  const canReply = (c: Conversation | null) =>
    !!c && (!!access?.is_owner ||
      !!access?.workspaces.find((w) => w.company_id === c.company_id)?.permissions?.includes('inbox.reply'));
  const canPauseBusiness = businesses.length > 0;
  const canPauseAll = !!access?.pause_all;

  async function act(body: object, after?: () => void) {
    setBusy(true);
    setError('');
    const r = await post(body);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    if (r.warning) setError(r.warning);
    after?.();
    await loadList();
    if (openId) await loadMessages(openId);
  }

  const pauseAll = pauses.find((p) => p.scope === 'all');
  const [pauseTarget, setPauseTarget] = useState('clif');

  return (
    <div className="flex flex-col w-full gap-space-24">
      {/* Emergency stop */}
      <Card className="flex flex-col gap-space-12">
        <div className="flex flex-wrap items-center justify-between gap-space-12">
          <div className="flex items-center gap-space-8">
            <Icon name="emergency_home" className={`text-[22px] ${pauses.length ? 'text-error' : 'text-outline'}`} />
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface">Emergency stop</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {pauses.length === 0
                  ? 'All agents are answering. A pause silences them at once; each visitor gets one holding reply.'
                  : 'Paused agents send no AI reply. Each visitor gets one holding reply, and the team answers here.'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-8">
            {!pauseAll && (canPauseBusiness || canPauseAll) && (
              <>
                {canPauseBusiness && (<>
                <label htmlFor="pause-target" className="sr-only">Business to pause</label>
                <select
                  id="pause-target"
                  value={pauseTarget}
                  onChange={(e) => setPauseTarget(e.target.value)}
                  className="bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg px-space-8 py-space-8 border border-outline-variant"
                >
                  {businesses.map((b) => (
                    <option key={b.slug} value={b.slug}>{b.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const name = businesses.find((b) => b.slug === pauseTarget)?.name ?? pauseTarget;
                    if (confirm(`Pause the agent for ${name}? Its visitors get one holding reply and no AI answers until you resume.`))
                      act({ action: 'pause', scope: 'business', key: pauseTarget });
                  }}
                  className="px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold border border-error text-error hover:bg-error-container disabled:opacity-50"
                >
                  Pause this business
                </button>
                </>)}
                {canPauseAll && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm('Pause ALL agents on every WhatsApp line? No AI replies until you resume.'))
                      act({ action: 'pause', scope: 'all' });
                  }}
                  className="px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold bg-error text-on-error hover:opacity-90 disabled:opacity-50"
                >
                  Pause all agents
                </button>
                )}
              </>
            )}
            {!canPauseBusiness && !canPauseAll && (
              <span className="font-body-sm text-body-sm text-outline">View only: pausing needs another role.</span>
            )}
          </div>
        </div>
        {pauses.length > 0 && (
          <ul className="flex flex-col gap-space-8">
            {pauses.map((p) => (
              <li key={p.pause_id} className="flex flex-wrap items-center justify-between gap-space-8 bg-error-container/40 rounded-lg px-space-12 py-space-8">
                <span className="font-body-sm text-body-sm text-on-surface">
                  <b>
                    {p.scope === 'all'
                      ? 'All agents'
                      : p.scope === 'business'
                        ? businesses.find((b) => b.slug === p.scope_key)?.name ?? p.scope_key
                        : `Line ${p.scope_key}`}
                  </b>{' '}
                  paused by {p.paused_by} · {when(p.paused_at)}
                </span>
                {(p.scope === 'all' ? canPauseAll : businesses.some((b) => b.slug === p.scope_key)) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ action: 'resume', pause_id: p.pause_id })}
                  className="px-space-12 py-space-4 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  Resume
                </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {error && (
        <div role="alert" className="flex items-start gap-space-8 bg-error-container text-on-error-container rounded-lg px-space-12 py-space-8 font-body-sm text-body-sm">
          <Icon name="error" className="text-[18px]" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss" className="font-semibold">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-space-16 min-h-[560px]">
        {/* Conversation list */}
        <Card padded={false} className={`flex flex-col overflow-hidden ${open ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-space-16 py-space-12 border-b border-surface-container flex items-center justify-between">
            <span className="font-label-md text-label-md text-outline uppercase">Conversations · 14 days</span>
            <span className="font-body-sm text-body-sm text-outline">{conversations.length}</span>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {loaded && conversations.length === 0 && (
              <li className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
                No WhatsApp conversations in the last 14 days.
              </li>
            )}
            {conversations.map((c) => (
              <li key={c.conversation_id}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.conversation_id)}
                  className={`w-full text-left px-space-16 py-space-12 border-b border-surface-container flex flex-col gap-space-4 hover:bg-surface-container-low ${
                    c.conversation_id === openId ? 'bg-surface-container-low' : ''
                  }`}
                >
                  <span className="flex items-center justify-between gap-space-8">
                    <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{who(c)}</span>
                    <span className="font-body-sm text-body-sm text-outline whitespace-nowrap">{when(c.last_at)}</span>
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                    {c.last_sender === 'customer' ? '' : c.last_sender === 'person' ? 'You/team: ' : c.last_sender === 'agent' ? 'Aya: ' : ''}
                    {c.last_body ?? '—'}
                  </span>
                  <span className="flex flex-wrap items-center gap-space-4">
                    {c.handled_by === 'person' ? (
                      <Chip tone="person" icon="person">{c.handler_name}</Chip>
                    ) : (
                      <Chip tone="agent" icon="smart_toy">Aya</Chip>
                    )}
                    {c.area && <Chip tone="muted">{c.enquiry ? `${c.area} · ${c.enquiry}` : c.area}</Chip>}
                    {c.status === 'closed' && <Chip tone="muted">Closed</Chip>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Open conversation */}
        <Card padded={false} className={`flex flex-col overflow-hidden ${open ? 'flex' : 'hidden lg:flex'}`}>
          {!open ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-space-8 p-space-24 text-center">
              <Icon name="forum" className="text-outline text-[32px]" />
              <span className="font-body-md text-body-md text-on-surface-variant">
                Choose a conversation to read it, take it over or reply.
              </span>
            </div>
          ) : (
            <>
              <div className="px-space-16 py-space-12 border-b border-surface-container flex flex-wrap items-center justify-between gap-space-8">
                <div className="flex items-center gap-space-8 min-w-0">
                  <button type="button" onClick={() => setOpenId(null)} className="lg:hidden" aria-label="Back to the list">
                    <Icon name="arrow_back" className="text-[20px] text-on-surface-variant" />
                  </button>
                  <div className="flex flex-col min-w-0">
                    <span className="font-headline-sm text-headline-sm text-on-surface truncate">{who(open)}</span>
                    <span className="font-body-sm text-body-sm text-outline">
                      +{open.phone}
                      {open.area ? ` · ${open.area}` : ''}
                      {open.enquiry ? ` · ${open.enquiry}` : ''}
                    </span>
                  </div>
                </div>
                {!canReply(open) ? (
                  <span className="font-body-sm text-body-sm text-outline">View only</span>
                ) : open.handled_by === 'agent' ? (
                  <button
                    type="button"
                    disabled={busy || open.status === 'closed' || intro !== null}
                    onClick={() => setIntro(introFor(open, meName))}
                    className="px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    Take over
                  </button>
                ) : mine ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: 'return', conversation_id: open.conversation_id })}
                    className="px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                  >
                    Hand back to Aya
                  </button>
                ) : (
                  <span className="font-body-sm text-body-sm text-on-surface-variant">{open.handler_name} is handling this</span>
                )}
              </div>

              {intro !== null && open.handled_by === 'agent' && (
                <div className="px-space-16 py-space-12 border-b border-surface-container flex flex-col gap-space-8 bg-secondary-container/30">
                  <label htmlFor="takeover-intro" className="font-label-md text-label-md text-on-surface-variant">
                    Message to {who(open)} when you take over
                  </label>
                  <textarea
                    id="takeover-intro"
                    rows={3}
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                    disabled={!open.window_open}
                    className="w-full resize-y bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg px-space-12 py-space-8 border border-outline-variant disabled:opacity-50"
                  />
                  {!open.window_open && (
                    <span className="font-body-sm text-body-sm text-error">
                      The customer’s last message is more than 24 hours old, so WhatsApp will not deliver this. You can still take over.
                    </span>
                  )}
                  <div className="flex flex-wrap gap-space-8">
                    <button
                      type="button"
                      disabled={busy || !open.window_open || !intro.trim()}
                      onClick={() => act({ action: 'take', conversation_id: open.conversation_id, intro }, () => setIntro(null))}
                      className="px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50"
                    >
                      Take over &amp; send
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act({ action: 'take', conversation_id: open.conversation_id }, () => setIntro(null))}
                      className="px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                    >
                      Take over without a message
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntro(null)}
                      className="px-space-12 py-space-8 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container-high"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-space-16 py-space-16 flex flex-col gap-space-8 bg-surface-container-low/50">
                {messages.map((m) =>
                  m.sender === 'system' ? (
                    <div key={m.message_id} className="self-center font-body-sm text-body-sm text-outline text-center max-w-[80%]">
                      {m.body} · {when(m.created_at)}
                    </div>
                  ) : (
                    <div
                      key={m.message_id}
                      className={`max-w-[80%] rounded-xl px-space-12 py-space-8 flex flex-col gap-space-2 ${
                        m.direction === 'in'
                          ? 'self-start bg-surface-container-lowest text-on-surface'
                          : m.sender === 'person'
                            ? 'self-end bg-secondary-container text-on-secondary-container'
                            : 'self-end bg-primary-container/15 text-on-surface'
                      }`}
                    >
                      <span className="font-label-sm text-label-sm opacity-70">
                        {m.direction === 'in' ? (m.kind === 'voice' ? 'Voice note (transcribed)' : 'Customer')
                          : m.sender === 'person' ? m.sender_name : 'Aya'}
                      </span>
                      <span className="font-body-md text-body-md whitespace-pre-wrap break-words">{m.body ?? '—'}</span>
                      <span className="font-body-sm text-body-sm opacity-60 self-end">{when(m.created_at)}</span>
                    </div>
                  )
                )}
                {messages.length === 0 && (
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Messages are logged from 18 September 2026; earlier ones are not shown.
                  </span>
                )}
                <div ref={endRef} />
              </div>

              <form
                className="border-t border-surface-container p-space-12 flex flex-col gap-space-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) act({ action: 'send', conversation_id: open.conversation_id, text: draft }, () => setDraft(''));
                }}
              >
                {!canReply(open) ? (
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Your access to this conversation is view-only.
                  </span>
                ) : !mine ? (
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {open.handled_by === 'agent'
                      ? 'Aya is answering this conversation. Take it over to reply yourself; Aya stays silent until you hand it back.'
                      : `${open.handler_name} is handling this conversation.`}
                  </span>
                ) : !open.window_open ? (
                  <span className="font-body-sm text-body-sm text-error">
                    The customer’s last message is more than 24 hours old. WhatsApp only allows an approved template now.
                  </span>
                ) : null}
                <div className="flex items-end gap-space-8">
                  <label htmlFor="inbox-reply" className="sr-only">Reply</label>
                  <textarea
                    id="inbox-reply"
                    rows={2}
                    value={draft}
                    disabled={!mine || !open.window_open || busy}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={mine ? 'Write a reply…' : ''}
                    className="flex-1 resize-y bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded-lg px-space-12 py-space-8 border border-outline-variant disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!mine || !open.window_open || busy || !draft.trim()}
                    className="px-space-16 py-space-8 rounded-lg font-body-sm text-body-sm font-semibold bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Chip({ tone, icon, children }: { tone: 'agent' | 'person' | 'muted'; icon?: string; children: React.ReactNode }) {
  const cls =
    tone === 'person'
      ? 'bg-secondary-container text-on-secondary-container'
      : tone === 'agent'
        ? 'bg-primary-container/15 text-primary'
        : 'bg-surface-container-high text-on-surface-variant';
  return (
    <span className={`font-label-sm text-label-sm px-space-8 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap ${cls}`}>
      {icon && <Icon name={icon} className="text-[12px]" />}
      {children}
    </span>
  );
}
