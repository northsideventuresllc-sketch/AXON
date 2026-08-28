'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import { speak } from '@/components/axon-v0/voice';
import { RouterDecisionPanel } from '@/components/axon-v0/router-decision-panel';

interface Agent {
  id: string;
  role: string;
  name: string;
  description: string | null;
}

interface VentureToolRow {
  id: string;
  tool_slug: string;
  display_name: string | null;
  notes: string | null;
}

interface Venture {
  id: string;
  name: string;
  tagline: string | null;
  accent: string;
  agents: Agent[];
  tools: VentureToolRow[];
}

interface Msg {
  id: string;
  agent_id: string | null;
  sender: string;
  content: string;
  created_at: string;
  meta?: { route?: string };
}

interface CatalogTool {
  slug: string;
  name: string;
  icon: string;
}

interface ThreadSummary {
  thread: string;
  title: string;
  last_message_at: string;
  last_sender: string;
}

const ROLE_GLYPH: Record<string, string> = {
  exec_assistant: '◈',
  build_manager: '⬢',
  pulse: '◉',
  council: '⬟',
  creator: '✦',
};

// Only the Exec Assistant answers for real in v0 — the rest hold presence.
const LIVE_ROLES = new Set(['exec_assistant']);

export function VentureRoom({ ventureId }: { ventureId: string }) {
  const [venture, setVenture] = useState<Venture | null>(null);
  const [others, setOthers] = useState<Venture[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputMode, setInputMode] = useState<'chat' | 'cli'>('chat');
  const [targetAgent, setTargetAgent] = useState<string | null>(null);
  const [autoVoice, setAutoVoice] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [catalog, setCatalog] = useState<CatalogTool[]>([]);
  const [error, setError] = useState('');
  const [lastReplyAgent, setLastReplyAgent] = useState<string | null>(null);
  const [decisionTick, setDecisionTick] = useState(0);
  const [activeThread, setActiveThread] = useState('group');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loggedOut, setLoggedOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadVenture = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/ventures'))
      .then((r) => r.json())
      .then((d) => {
        const all: Venture[] = d.ventures || [];
        setVenture(all.find((v) => v.id === ventureId) || null);
        setOthers(all.filter((v) => v.id !== ventureId));
      })
      .catch(() => setError('Could not reach the venture grid.'));
  }, [ventureId]);

  // Saved-chats sidebar. A 401 here means the session cookie expired mid-visit
  // (the page itself already passed middleware auth to render) — show the sign-in
  // invitation instead of an empty/broken list, per JB's explicit requirement.
  const loadThreads = useCallback(() => {
    fetch(apiUrl(`/api/axon-v0/threads?ventureId=${ventureId}`))
      .then((r) => {
        if (r.status === 401) {
          setLoggedOut(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setLoggedOut(false);
        setThreads(d.threads || []);
      })
      .catch(() => {});
  }, [ventureId]);

  const loadMessages = useCallback(
    (thread: string) => {
      fetch(apiUrl(`/api/axon-v0/agent-chat?ventureId=${ventureId}&thread=${encodeURIComponent(thread)}`))
        .then((r) => r.json())
        .then((d) => setMessages(d.messages || []))
        .catch(() => {});
    },
    [ventureId]
  );

  useEffect(() => {
    loadVenture();
    loadThreads();
    fetch(apiUrl(`/api/axon-v0/venture-tools?ventureId=${ventureId}`))
      .then((r) => r.json())
      .then((d) => setCatalog(d.catalog || []))
      .catch(() => {});
  }, [ventureId, loadVenture, loadThreads]);

  useEffect(() => {
    loadMessages(activeThread);
  }, [activeThread, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function openThread(thread: string) {
    setActiveThread(thread);
    setError('');
  }

  function startNewChat() {
    const id = `sub:${(globalThis.crypto ?? crypto).randomUUID()}`;
    setMessages([]);
    setActiveThread(id);
    setError('');
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !venture) return;
    setSending(true);
    setError('');
    setInput('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/agent-chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ventureId,
          agentId: targetAgent,
          message: text,
          thread: activeThread,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'The room did not answer.');
      setMessages((prev) => [...prev, d.userMsg, d.agentMsg]);
      if (d.agentMsg?.agent_id) {
        setLastReplyAgent(d.agentMsg.agent_id);
        setDecisionTick((t) => t + 1);
      }
      if (autoVoice && d.agentMsg?.content) speak(d.agentMsg.content);
      loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The room did not answer.');
    } finally {
      setSending(false);
    }
  }

  async function assignTool(slug: string) {
    await fetch(apiUrl('/api/axon-v0/venture-tools'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ventureId, toolSlug: slug }),
    }).catch(() => {});
    loadVenture();
  }

  if (!venture) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="v0-dot font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/70">
          {error || 'locating venture…'}
        </p>
      </div>
    );
  }

  const exec = venture.agents.find((a) => a.role === 'exec_assistant');
  const assignedSlugs = new Set(venture.tools.map((t) => t.tool_slug));

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
            ← Command deck
          </Link>
          <h1 className="v0-neon mt-1 text-3xl">{venture.name}</h1>
          {venture.tagline && <p className="mt-1 text-sm text-slate-400">{venture.tagline}</p>}
        </div>
        <button onClick={() => setShowTools((s) => !s)} className="v0-chip text-cyan-200">
          🧰 Tools ({venture.tools.length})
        </button>
      </div>

      {/* Per-venture tools drawer */}
      {showTools && (
        <div className="v0-panel v0-rise mt-4 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
            Tools plugged into {venture.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {venture.tools.map((t) => {
              const cat = catalog.find((c) => c.slug === t.tool_slug);
              return (
                <span key={t.id} className="v0-chip bg-cyan-400/10 text-cyan-100">
                  {cat?.icon || '🔧'} {t.display_name || cat?.name || t.tool_slug}
                </span>
              );
            })}
            {venture.tools.length === 0 && (
              <span className="text-xs text-slate-500">No tools plugged in yet.</span>
            )}
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-slate-500">Available to plug in</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {catalog
              .filter((c) => !assignedSlugs.has(c.slug))
              .map((c) => (
                <button
                  key={c.slug}
                  onClick={() => assignTool(c.slug)}
                  className="v0-chip text-slate-300 hover:text-cyan-200"
                >
                  ＋ {c.icon} {c.name}
                </button>
              ))}
          </div>
          <p className="mt-3 text-[10px] text-slate-500">
            Rename a tool or add venture-specific notes from the <Link href="/toolkit" className="text-cyan-300">Toolkit</Link>.
          </p>
        </div>
      )}

      {/* Agent deck — Droid Space */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {venture.agents.map((a, i) => {
          const live = LIVE_ROLES.has(a.role);
          const selected = targetAgent === a.id || (!targetAgent && a.role === 'exec_assistant');
          return (
            <button
              key={a.id}
              onClick={() => setTargetAgent(live ? a.id : targetAgent)}
              title={a.description || a.name}
              className={`v0-panel relative p-3 text-left transition ${
                selected ? 'border-cyan-400/60' : ''
              } ${live ? 'cursor-pointer hover:border-cyan-400/40' : 'cursor-default opacity-80'}`}
            >
              <div
                className="v0-droid mx-auto flex h-12 w-12 items-center justify-center rounded-full border text-xl"
                style={{
                  animationDelay: `${i * 0.35}s`,
                  borderColor: `${venture.accent}55`,
                  color: venture.accent,
                  boxShadow: `0 0 18px ${venture.accent}33`,
                }}
              >
                {ROLE_GLYPH[a.role] || '◇'}
              </div>
              <p className="mt-2 text-center text-[11px] leading-tight text-slate-200">{a.name}</p>
              <p className="mt-1 text-center text-[9px] uppercase tracking-widest">
                {live ? (
                  <span className="v0-dot text-emerald-300">online</span>
                ) : (
                  <span className="text-slate-500">standby · build 2</span>
                )}
              </p>
            </button>
          );
        })}
      </div>

      {/* Saved chats + group chat */}
      <div className="mt-6 flex flex-col gap-4 lg:flex-row">
        {/* Saved-chats sidebar */}
        <div className="v0-panel flex w-full flex-col p-4 lg:w-56 lg:flex-none">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Saved chats</p>
          {loggedOut ? (
            <div className="mt-3">
              <p className="text-xs text-slate-400">Sign in to see and save your chats.</p>
              <Link href="/login" className="v0-chip mt-2 inline-block bg-cyan-400/15 text-cyan-100">
                Log In
              </Link>
            </div>
          ) : (
            <>
              <button
                onClick={startNewChat}
                className="v0-chip mt-3 w-full bg-cyan-400/15 text-cyan-100"
              >
                ＋ New Chat
              </button>
              <div className="mt-3 flex flex-col gap-1.5 overflow-y-auto lg:max-h-96">
                {threads.length === 0 && (
                  <p className="text-xs text-slate-500">No saved chats yet.</p>
                )}
                {threads.map((t) => (
                  <button
                    key={t.thread}
                    onClick={() => openThread(t.thread)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                      activeThread === t.thread
                        ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-100'
                        : 'border-white/10 bg-black/30 text-slate-300 hover:border-cyan-400/30'
                    }`}
                  >
                    <p className="truncate">{t.title}</p>
                    <p className="mt-0.5 text-[9px] uppercase tracking-widest text-slate-500">
                      {new Date(t.last_message_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Group chat */}
        <div className="v0-panel flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
            Venture room — everything connected
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAutoVoice((v) => !v)}
              className={`v0-chip ${autoVoice ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
            >
              🔊 voice
            </button>
            {(['chat', 'cli'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setInputMode(m)}
                className={`v0-chip ${inputMode === m ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
              >
                {m === 'chat' ? '💬 chat' : '⌨ CLI'}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="mt-3 h-80 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <p className="text-xs text-slate-500">
              Quiet room. {exec ? `Say something — ${exec.name} is listening.` : 'No agents seeded yet.'}
            </p>
          )}
          {messages.map((m) => {
            const mine = m.sender === 'user';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${
                    mine
                      ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-50'
                      : 'border-white/10 bg-black/40 text-slate-200'
                  }`}
                >
                  {!mine && (
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-cyan-300/70">
                      {m.sender}
                      {m.meta?.route && <span className="ml-2 text-slate-500">via {m.meta.route}</span>}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {!mine && (
                    <button
                      onClick={() => speak(m.content)}
                      className="mt-1 text-[10px] text-slate-500 hover:text-cyan-300"
                    >
                      ▶ read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {sending && (
            <p className="v0-dot font-mono text-[11px] text-cyan-300/70">▸ routing through the harness…</p>
          )}
        </div>

        <RouterDecisionPanel agentId={lastReplyAgent || targetAgent || exec?.id || null} refreshKey={decisionTick} />

        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

        <div
          className={`mt-3 flex items-end gap-2 rounded-xl border px-3 py-2 ${
            inputMode === 'cli'
              ? 'border-emerald-400/30 bg-black/70 font-mono'
              : 'border-cyan-400/20 bg-black/40'
          }`}
        >
          {inputMode === 'cli' && <span className="pb-1 text-sm text-emerald-300">❯</span>}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={inputMode === 'cli' ? 1 : 2}
            placeholder={
              inputMode === 'cli'
                ? 'one-off build order…'
                : `Message ${venture.agents.find((a) => a.id === targetAgent)?.name || exec?.name || 'the room'}…`
            }
            className={`w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-500 ${
              inputMode === 'cli' ? 'text-emerald-200' : 'text-slate-100'
            }`}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="v0-chip mb-0.5 bg-cyan-400/15 text-cyan-100 disabled:opacity-40"
          >
            {sending ? '…' : 'Send ➤'}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          One brain, many rooms — this room can see and reference the other ventures:{' '}
          {others.map((o, i) => (
            <span key={o.id}>
              {i > 0 && ' · '}
              <Link href={`/v/${o.id}`} className="text-cyan-300/80 hover:text-cyan-200">
                {o.name}
              </Link>
            </span>
          ))}
        </p>
        </div>
      </div>
    </div>
  );
}
