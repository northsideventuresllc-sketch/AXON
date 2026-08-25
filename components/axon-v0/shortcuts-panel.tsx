'use client';

import { useEffect, useState } from 'react';
import { loadPrefs, patchPrefs, type Shortcut } from '@/lib/axon-v0/view-prefs';
import { apiUrl } from '@/lib/api-base';
import './widgets.css';

/**
 * Shortcuts panel — create-only deep-links into a specific spot in a venture.
 * Labels render ALL CAPS, no emojis. Stored per-viewer in view-prefs.
 */
export function ShortcutsPanel({ bare = false }: { bare?: boolean } = {}) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('');
  const [href, setHref] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    try {
      setShortcuts(loadPrefs().shortcuts || []);
    } catch {
      setShortcuts([]);
    }
  }, []);

  function persist(next: Shortcut[]) {
    setShortcuts(next);
    try {
      patchPrefs({ shortcuts: next });
    } catch {
      /* storage blocked — keep in-memory */
    }
  }

  function save() {
    const l = label.trim();
    const h = href.trim();
    if (!l || !h) return;
    const item: Shortcut = {
      id: `sc_${Date.now().toString(36)}`,
      label: l,
      href: h,
      note: note.trim() || undefined,
    };
    persist([...shortcuts, item]);
    setLabel('');
    setHref('');
    setNote('');
    setCreating(false);
  }

  function remove(id: string) {
    persist(shortcuts.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {bare ? <span /> : <span className="wg-head">Shortcuts</span>}
        {!creating && (
          <button className="wg-link" onClick={() => setCreating(true)}>
            + CREATE SHORTCUT
          </button>
        )}
      </div>

      {creating && (
        <div className="wg-row space-y-1.5 rounded-lg border border-cyan-400/15 bg-[#0A1628]/40 p-2.5">
          <p className="wg-sub">Describe the shortcut — where in a venture should it jump you?</p>
          <input
            className="wg-field"
            placeholder="Label (e.g. NI billing thread)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <input
            className="wg-field"
            placeholder="Deep-link (e.g. /v/ni#billing)"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <input
            className="wg-field"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2 pt-0.5">
            <button className="wg-btn" onClick={save} disabled={!label.trim() || !href.trim()}>
              Save
            </button>
            <button className="wg-link" onClick={() => setCreating(false)}>
              cancel
            </button>
          </div>
        </div>
      )}

      {shortcuts.length === 0 && !creating && (
        <p className="wg-sub leading-relaxed">
          No shortcuts yet. A shortcut jumps you straight to a specific spot inside a venture —
          a thread, a room, a task — instead of navigating there each time.
        </p>
      )}

      {shortcuts.length > 0 && (
        <ul className="space-y-1">
          {shortcuts.map((s) => (
            <li key={s.id} className="wg-row group flex items-center gap-2">
              <a
                href={apiUrl(s.href)}
                className="min-w-0 flex-1 truncate text-[13px] tracking-[0.08em] text-slate-200 transition hover:text-cyan-200"
                title={s.note || s.href}
              >
                {s.label.toUpperCase()}
              </a>
              <button
                className="wg-icon-btn opacity-0 transition group-hover:opacity-100"
                onClick={() => remove(s.id)}
                aria-label="Remove shortcut"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ShortcutsPanel;
