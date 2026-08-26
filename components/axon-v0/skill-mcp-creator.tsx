'use client';

import { useEffect, useRef, useState } from 'react';

type Kind = 'skill' | 'mcp';

interface DraftSpec {
  kind: Kind;
  slug: string;
  name: string;
  summary: string;
  triggers: string[];
  notes: string;
}

interface ChatMsg {
  id: string;
  role: 'you' | 'axon';
  text: string;
  draft?: DraftSpec;
}

let msgSeq = 0;
const nextId = () => `c${Date.now()}-${msgSeq++}`;

const KIND_COPY: Record<Kind, { label: string; icon: string; placeholder: string; opener: string }> = {
  skill: {
    label: 'Skill',
    icon: '✦',
    placeholder: 'e.g. a skill that reviews outreach copy for Northside brand voice before it sends',
    opener:
      'Describe the skill you want and I will draft its spec — a name, what it does, and when it should trigger. Drafts a spec — building it comes next.',
  },
  mcp: {
    label: 'MCP',
    icon: '◈',
    placeholder: 'e.g. an MCP server that exposes my Stripe payouts and refunds as tools',
    opener:
      'Describe the MCP server you want and I will draft its spec — a name, what it connects to, and the tools it should expose. Drafts a spec — building it comes next.',
  },
};

// Slug/snake -> Title Case.
function titleCase(raw: string): string {
  return String(raw || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

// Local, no-network draft: turn a free-text description into a structured spec.
function draftSpec(kind: Kind, prompt: string): DraftSpec {
  const words = prompt.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const nameWords = words.slice(0, 4).join(' ') || (kind === 'skill' ? 'New Skill' : 'New MCP');
  const name = titleCase(nameWords) + (kind === 'mcp' ? ' MCP' : '');
  const slug = slugify(name);
  const summary = prompt.trim().charAt(0).toUpperCase() + prompt.trim().slice(1);
  const triggers =
    kind === 'skill'
      ? ['When JB asks for this by name', 'When the described situation is detected mid-task']
      : ['Exposed as callable tools to any AXON agent', 'Invoked when a task needs this data source'];
  return {
    kind,
    slug,
    name,
    summary,
    triggers,
    notes: 'Draft only — provisioning is not wired up in this build.',
  };
}

export function SkillMcpCreator({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const copy = KIND_COPY[kind];
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: nextId(), role: 'axon', text: copy.opener },
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

  function send() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput('');
    setMessages((m) => [...m, { id: nextId(), role: 'you', text: prompt }]);
    setBusy(true);
    // Local draft — simulate a beat so it reads like a chat, no network call.
    window.setTimeout(() => {
      const spec = draftSpec(kind, prompt);
      setDraft(spec);
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: 'axon',
          text: `Here's a draft ${copy.label} spec for "${spec.name}". Refine it by describing changes, or copy the spec — building it comes next.`,
          draft: spec,
        },
      ]);
      setBusy(false);
    }, 450);
  }

  return (
    <div
      className="sk-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${copy.label} Creator`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sk-modal v0-panel p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="sk-icon-badge">{copy.icon}</span>
            <div>
              <h2 className="text-lg text-slate-100">Create {copy.label}</h2>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Describe it — AXON drafts the spec
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="v0-chip text-slate-300 hover:text-cyan-200">
            ✕
          </button>
        </div>

        <div ref={scrollRef} className="sk-chat-scroll v0-scroll mt-4 space-y-3 pr-1">
          {messages.map((m) => (
            <div key={m.id} className={`sk-msg ${m.role === 'you' ? 'text-right' : ''}`}>
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
                      {copy.icon} {m.draft.name}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-cyan-300/60">
                      {m.draft.slug}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">{m.draft.summary}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-cyan-300/50">
                      {kind === 'skill' ? 'Triggers' : 'Surface'}
                    </p>
                    <ul className="mt-1 space-y-1 text-xs text-slate-400">
                      {m.draft.triggers.map((t, i) => (
                        <li key={i}>› {t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="sk-msg">
              <div className="inline-block rounded-2xl border border-white/10 bg-black/40 px-3 py-2">
                <span className="sk-typing-dot" />
                <span className="sk-typing-dot" />
                <span className="sk-typing-dot" />
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
              placeholder={copy.placeholder}
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
          <p className="mt-2 text-[11px] text-slate-500">
            Drafts a spec — building it comes next. Nothing is provisioned or sent from here.
          </p>
          {draft && (
            <button
              onClick={onClose}
              disabled={busy}
              className="mt-2 w-full rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-40"
            >
              Done — close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
