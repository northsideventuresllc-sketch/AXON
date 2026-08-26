'use client';

import { useEffect, useRef, useState } from 'react';
import type { CustomWidgetSpec } from '@/lib/axon-v0/view-prefs';
import './widgets-3d.css';

/**
 * Describe-to-chat custom widget maker — modeled on tool-maker.tsx, but the
 * draft is composed locally (no API route exists for widget provisioning yet).
 * The UI is explicit that this saves a spec; real provisioning is the next step.
 */

interface DraftSpec {
  name: string;
  icon: string;
  summary: string;
  fields: string[];
}

interface ChatMsg {
  id: string;
  role: 'you' | 'axon';
  text: string;
  draft?: DraftSpec;
}

let seq = 0;
const nextId = () => `w${Date.now()}-${seq++}`;

const ICONS = ['✦', '◈', '◉', '▣', '⧉', '◫', '⚑', '✧'];

/** Cheap local heuristic that turns a description into a reviewable spec. */
function draftFromPrompt(prompt: string): DraftSpec {
  const clean = prompt.trim().replace(/\s+/g, ' ');
  // name: first few significant words, title-cased
  const words = clean.split(' ').filter(Boolean);
  const name =
    words
      .slice(0, 4)
      .join(' ')
      .replace(/[.,;:!?]+$/, '')
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Custom Widget';
  const icon = ICONS[Math.abs(hash(clean)) % ICONS.length];
  const fields: string[] = [];
  if (/count|number|total|how many/i.test(clean)) fields.push('A headline number');
  if (/list|feed|recent|latest|items/i.test(clean)) fields.push('A short list of recent items');
  if (/status|state|health|up|down|live/i.test(clean)) fields.push('A status indicator');
  if (/chart|graph|trend|over time/i.test(clean)) fields.push('A trend sparkline');
  if (/link|jump|open|go to/i.test(clean)) fields.push('A quick action / link');
  if (fields.length === 0) fields.push('A single summary line');
  return { name, icon, summary: clean, fields };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}

export function CustomWidgetMaker({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (spec: CustomWidgetSpec) => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: nextId(),
      role: 'axon',
      text: 'Describe the widget you want on your home space and I will draft its spec. When it looks right, hit Create — it saves locally as a draft. (Live provisioning comes next.)',
    },
  ]);
  const [input, setInput] = useState('');
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
  }, [messages]);

  function send() {
    const prompt = input.trim();
    if (!prompt) return;
    setInput('');
    const spec = draftFromPrompt(prompt);
    setDraft(spec);
    setMessages((m) => [
      ...m,
      { id: nextId(), role: 'you', text: prompt },
      {
        id: nextId(),
        role: 'axon',
        text: `Here's a draft for "${spec.name}". Review it and Create when ready, or describe changes and I'll redraft.`,
        draft: spec,
      },
    ]);
  }

  function create() {
    if (!draft) return;
    const spec: CustomWidgetSpec = {
      id: `cw_${Date.now().toString(36)}`,
      name: draft.name,
      summary: draft.summary,
      icon: draft.icon,
      createdAt: new Date().toISOString(),
    };
    onCreated(spec);
  }

  return (
    <div
      className="w3-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Custom widget maker"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w3-modal">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w3-cat-ico" style={{ width: 40, height: 40, fontSize: 18 }}>✦</span>
            <div>
              <h2 className="w3-modal-title">Create custom widget</h2>
              <p className="w3-modal-kicker">Describe it — AXON drafts the spec</p>
            </div>
          </div>
          <button className="w3-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div ref={scrollRef} className="mt-4 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'you' ? 'text-right' : ''}>
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
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {m.draft.fields.map((f, i) => (
                        <li key={i}>› {f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
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
              placeholder="e.g. a card that shows today's outreach replies waiting on approval"
              className="w3-field flex-1"
            />
            <button onClick={send} disabled={!input.trim()} className="w3-primary">
              Draft
            </button>
          </div>
          {draft && (
            <button onClick={create} className="w3-primary mt-2 w-full">
              ＋ Create "{draft.name}"
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
