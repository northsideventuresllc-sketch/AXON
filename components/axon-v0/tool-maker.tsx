'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';

interface DraftSpec {
  slug: string;
  name: string;
  sourceType: 'custom';
  icon: string;
  summary: string;
  steps: string[];
  notes: string;
}

interface ChatMsg {
  id: string;
  role: 'you' | 'axon';
  text: string;
  draft?: DraftSpec;
}

let msgSeq = 0;
const nextId = () => `m${Date.now()}-${msgSeq++}`;

export function ToolMaker({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: nextId(),
      role: 'axon',
      text: 'Describe the tool you want and I will draft its spec. When it looks right, hit Create and it joins your Toolkit as a custom tool.',
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftSpec | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput('');
    setMessages((m) => [...m, { id: nextId(), role: 'you', text: prompt }]);
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/axon-v0/tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft', prompt }),
      });
      const d = await res.json();
      const spec: DraftSpec | undefined = d.draft;
      if (spec) {
        setDraft(spec);
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: 'axon',
            text: `Here's a draft spec for "${spec.name}". Review it and Create when ready, or describe changes and I'll redraft.`,
            draft: spec,
          },
        ]);
      } else {
        setMessages((m) => [...m, { id: nextId(), role: 'axon', text: 'Could not draft that — try describing it another way.' }]);
      }
    } catch {
      setMessages((m) => [...m, { id: nextId(), role: 'axon', text: 'Draft failed. Try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/axon-v0/tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: draft.name,
          slug: draft.slug,
          notes: draft.notes || draft.summary,
          icon: draft.icon,
        }),
      });
      await res.json();
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'axon', text: `✓ "${draft.name}" is now in your Toolkit as a custom tool.` },
      ]);
      setDraft(null);
      onCreated();
    } catch {
      setMessages((m) => [...m, { id: nextId(), role: 'axon', text: 'Create failed. Try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="tk-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Tool Maker"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tk-modal v0-panel p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="tk-icon-badge tk-live-ring">🛠</span>
            <div>
              <h2 className="text-lg text-slate-100">Tool Maker</h2>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Chat AXON into a new tool
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="v0-chip text-slate-300 hover:text-cyan-200">
            ✕
          </button>
        </div>

        <div ref={scrollRef} className="tk-chat-scroll v0-scroll mt-4 space-y-3 pr-1">
          {messages.map((m) => (
            <div key={m.id} className={`tk-msg ${m.role === 'you' ? 'text-right' : ''}`}>
              <div
                className={`inline-block max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'you'
                    ? 'border border-cyan-400/30 bg-cyan-400/10 text-cyan-50'
                    : 'border border-white/10 bg-black/40 text-slate-200'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                {m.draft && (
                  <div className="mt-2 rounded-lg border border-cyan-400/20 bg-black/50 p-3 text-left">
                    <p className="text-sm text-slate-100">
                      {m.draft.icon} {m.draft.name}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-cyan-300/60">
                      {m.draft.slug}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">{m.draft.summary}</p>
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {m.draft.steps.map((s, i) => (
                        <li key={i}>› {s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="tk-msg">
              <div className="inline-block rounded-2xl border border-white/10 bg-black/40 px-3 py-2">
                <span className="tk-typing-dot" />
                <span className="tk-typing-dot" />
                <span className="tk-typing-dot" />
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-cyan-400/10 pt-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="e.g. a tool that watches my Stripe payouts and pings me when one lands"
              className="flex-1 rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40"
            >
              Draft
            </button>
          </div>
          {draft && (
            <button
              onClick={create}
              disabled={busy}
              className="mt-2 w-full rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-40"
            >
              ＋ Create "{draft.name}"
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
