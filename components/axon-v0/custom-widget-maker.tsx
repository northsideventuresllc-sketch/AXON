'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import type { CustomWidgetSpec } from '@/lib/axon-v0/view-prefs';
import { plainToolkitBuildStatus } from '@/lib/axon-v0/plain-labels';
import './widgets-3d.css';

/**
 * Describe-to-chat custom widget maker — modeled on tool-maker.tsx. The draft itself is
 * still composed locally (a cheap heuristic, same as before). What changed for item #10:
 * Create no longer just saves the spec to localStorage and stops — it also hands the
 * spec to the venture's Build Manager via /api/axon-v0/toolkit-build (gated by
 * FIRE/HOLD, dispatched through the one real fireAgent() path). That hand-off is
 * best-effort: a network failure or a HOLD gate never blocks saving the draft, it just
 * means buildStatus stays 'draft'/'held' instead of 'dispatched'. Real runtime
 * provisioning of a live widget component is still a later build — see
 * lib/axon-toolkit-build.mjs's SCOPE note.
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
      text: 'Describe the widget you want on your home space and I will draft its spec. When it looks right, hit Create — it saves locally and gets handed to your Build Manager to work on. (Live provisioning of the widget itself still comes next.)',
    },
  ]);
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<DraftSpec | null>(null);
  const [creating, setCreating] = useState(false);
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

  async function create() {
    if (!draft || creating) return;
    setCreating(true);
    const spec: CustomWidgetSpec = {
      id: `cw_${Date.now().toString(36)}`,
      name: draft.name,
      summary: draft.summary,
      icon: draft.icon,
      createdAt: new Date().toISOString(),
      buildStatus: 'draft',
    };
    try {
      const res = await fetch(apiUrl('/api/axon-v0/toolkit-build'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: { name: draft.name, summary: draft.summary, icon: draft.icon, fields: draft.fields } }),
      });
      const d = await res.json();
      if (d.ok) {
        spec.buildStatus = d.state === 'completed' ? 'completed' : 'dispatched';
        spec.buildNote = d.agentName ? `Handed to ${d.agentName}${d.ventureName ? ` (${d.ventureName})` : ''}.` : undefined;
      } else if (d.held) {
        spec.buildStatus = 'held';
        spec.buildNote = 'AXON is on HOLD, so this stays queued until JB fires the gate.';
      }
      // any other d.ok === false case leaves buildStatus at 'draft' — best-effort, non-fatal
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: 'axon',
          text: `✓ "${spec.name}" saved. ${plainToolkitBuildStatus(spec.buildStatus)}${spec.buildNote ? ` — ${spec.buildNote}` : '.'}`,
        },
      ]);
    } catch {
      // Network/parse failure — the draft still saves locally, just without a build hand-off.
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'axon', text: `✓ "${spec.name}" saved as a draft. Could not reach the Build Manager — try again later.` },
      ]);
    } finally {
      setDraft(null);
      setCreating(false);
      onCreated(spec);
    }
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
            <button onClick={create} disabled={creating} className="w3-primary mt-2 w-full disabled:opacity-40">
              {creating ? 'Handing off…' : `＋ Create "${draft.name}"`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
