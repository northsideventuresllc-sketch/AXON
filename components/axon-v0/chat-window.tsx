'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { plainDispatchState } from '@/lib/axon-v0/plain-labels';

/**
 * AXON usability item #6 — one floating window in the multi-window chat dock. Two
 * flavors, both rendered by the same shell:
 *
 *  - kind 'thread': a popped-out saved chat from the current venture room, reading and
 *    writing through the exact same /api/axon-v0/agent-chat endpoint the main pane uses
 *    (same thread convention, same store) — this is not a second chat model, just a
 *    second place the same thread is visible.
 *  - kind 'dispatch': a live cross-venture fireAgent() run, created already-in-flight by
 *    the parent (the POST to /api/axon-v0/dispatch happens once, before this window is
 *    opened) — this window just narrates the plain-English state as it resolves and shows
 *    the reply. It never re-fires; a stuck one can only be closed and retried.
 */

interface Msg {
  id: string;
  sender: string;
  content: string;
  created_at: string;
}

export interface ChatWindowSpec {
  kind: 'thread' | 'dispatch';
  ventureId: string;
  ventureName?: string | null;
  thread?: string;
  dispatchId?: string;
  title: string;
  // dispatch-only, present once the parent's fireAgent() call settles:
  state?: 'dispatched' | 'running' | 'completed' | 'timeout' | 'failed';
  reply?: string | null;
  reason?: string | null;
  route?: string | null;
  toAgentName?: string | null;
}

export function ChatWindow({ win, onClose }: { win: ChatWindowSpec; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(() => {
    if (win.kind !== 'thread' || !win.thread) return;
    fetch(apiUrl(`/api/axon-v0/agent-chat?ventureId=${win.ventureId}&thread=${encodeURIComponent(win.thread)}`))
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
  }, [win.kind, win.ventureId, win.thread]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending || win.kind !== 'thread') return;
    setSending(true);
    setInput('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/agent-chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ventureId: win.ventureId, message: text, thread: win.thread }),
      });
      const d = await res.json();
      if (res.ok) setMessages((prev) => [...prev, d.userMsg, d.agentMsg]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="v0-panel flex h-72 w-72 flex-col overflow-hidden p-2.5 shadow-2xl">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] uppercase tracking-[0.25em] text-cyan-300/80">
          {win.kind === 'dispatch' ? '⇄ ' : '⊞ '}
          {win.title}
        </p>
        <button onClick={onClose} className="text-slate-500 hover:text-cyan-200" aria-label="Close window">
          ✕
        </button>
      </div>
      {win.ventureName && <p className="text-[9px] text-slate-500">{win.ventureName}</p>}

      {win.kind === 'dispatch' ? (
        <div className="mt-2 flex-1 overflow-y-auto text-xs text-slate-200">
          <p className="v0-dot text-cyan-300/80">{plainDispatchState(win.state)}</p>
          {win.toAgentName && <p className="mt-1 text-slate-400">To {win.toAgentName}</p>}
          {win.reply && <p className="mt-2 whitespace-pre-wrap">{win.reply}</p>}
          {!win.reply && win.reason && win.state !== 'running' && win.state !== 'dispatched' && (
            <p className="mt-2 text-rose-300">{win.reason}</p>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="mt-2 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg border px-2 py-1 text-[11px] ${
                    m.sender === 'user'
                      ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-50'
                      : 'border-white/10 bg-black/40 text-slate-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-1.5 rounded-lg border border-cyan-400/20 bg-black/40 px-2 py-1.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Message…"
              className="w-full resize-none bg-transparent text-[11px] text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button onClick={send} disabled={sending || !input.trim()} className="text-cyan-200 disabled:opacity-40">
              ➤
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Docks every open window bottom-right, side by side. Fixed-position so the main venture
 *  room pane is unaffected by however many are open (bounded by MAX_WINDOWS upstream). */
export function ChatWindowDock({
  windows,
  onClose,
}: {
  windows: ChatWindowSpec[];
  onClose: (key: string) => void;
}) {
  if (windows.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-wrap-reverse justify-end gap-3">
      {windows.map((w) => (
        <ChatWindow
          key={w.kind === 'dispatch' ? `dispatch:${w.dispatchId}` : `thread:${w.ventureId}:${w.thread}`}
          win={w}
          onClose={() =>
            onClose(w.kind === 'dispatch' ? `dispatch:${w.dispatchId}` : `thread:${w.ventureId}:${w.thread}`)
          }
        />
      ))}
    </div>
  );
}
