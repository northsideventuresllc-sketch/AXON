'use client';

import { useState } from 'react';
import type { PuzzleTemplate, TemplateSlot } from '@/lib/axon-v0/view-prefs';
import './widgets-3d.css';

/**
 * Build-2 puzzle templates — presets shipped in code plus a build-your-own
 * editor. Applying a template arranges the active panels into its slots (column
 * span + row span) and sets the 2D/3D curve. Persisted (user builds) in
 * view-prefs by the caller.
 */

const grid = (n: number, col: number, rowSpan?: number): TemplateSlot[] =>
  Array.from({ length: n }, () => ({ col, ...(rowSpan ? { rowSpan } : {}) }));

export const BUILTIN_TEMPLATES: PuzzleTemplate[] = [
  {
    id: 'preset-default',
    name: 'Default grid',
    slots: grid(6, 1),
    is3D: false,
    builtin: true,
  },
  {
    id: 'preset-wide',
    name: 'Wide rectangles',
    slots: grid(6, 3), // each panel spans the full width — X > Y
    is3D: false,
    builtin: true,
  },
  {
    id: 'preset-tall',
    name: 'Tall column + wide center',
    // narrow tall panels either side, 1–2 full-width panels centered
    slots: [
      { col: 1, rowSpan: 2 },
      { col: 3 },
      { col: 3 },
      { col: 1, rowSpan: 2 },
      { col: 1, rowSpan: 2 },
      { col: 1, rowSpan: 2 },
    ],
    is3D: false,
    builtin: true,
  },
  {
    id: 'preset-2d',
    name: '2D only (flat)',
    slots: grid(6, 1),
    is3D: false,
    builtin: true,
  },
  {
    id: 'preset-3d',
    name: '3D only (curved)',
    slots: grid(6, 1),
    is3D: true,
    builtin: true,
  },
  {
    id: 'preset-toggle',
    name: '2D ↔ 3D toggle',
    slots: grid(6, 1),
    is3D: true,
    toggle2D3D: true,
    builtin: true,
  },
];

function Preview({ slots }: { slots: TemplateSlot[] }) {
  return (
    <div className="w3-tpl-preview">
      {slots.slice(0, 6).map((s, i) => (
        <div
          key={i}
          className="w3-tpl-cell"
          style={{ gridColumn: `span ${Math.min(3, Math.max(1, s.col))}`, height: s.rowSpan && s.rowSpan > 1 ? 20 : 12 }}
        />
      ))}
    </div>
  );
}

export function PuzzleTemplates({
  templates,
  activeTemplateId,
  onApply,
  onSaveTemplate,
  onDeleteTemplate,
  onClose,
}: {
  templates: PuzzleTemplate[]; // user-built
  activeTemplateId: string | null;
  onApply: (tpl: PuzzleTemplate) => void;
  onSaveTemplate: (tpl: PuzzleTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onClose: () => void;
}) {
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState('');
  const [slots, setSlots] = useState<TemplateSlot[]>([{ col: 1 }, { col: 1 }, { col: 1 }]);
  const [is3D, setIs3D] = useState(false);

  const all = [...BUILTIN_TEMPLATES, ...templates];

  function addSlot() {
    setSlots((s) => [...s, { col: 1 }]);
  }
  function cycleSlot(i: number) {
    setSlots((s) => s.map((sl, idx) => (idx === i ? { ...sl, col: sl.col >= 3 ? 1 : sl.col + 1 } : sl)));
  }
  function cycleRow(i: number) {
    setSlots((s) => s.map((sl, idx) => (idx === i ? { ...sl, rowSpan: (sl.rowSpan ?? 1) >= 2 ? 1 : 2 } : sl)));
  }
  function delSlot(i: number) {
    setSlots((s) => s.filter((_, idx) => idx !== i));
  }
  function save() {
    if (slots.length === 0) return;
    const tpl: PuzzleTemplate = {
      id: `tpl_${Date.now().toString(36)}`,
      name: name.trim() || 'My template',
      slots,
      is3D,
    };
    onSaveTemplate(tpl);
    setBuilding(false);
    setName('');
    setSlots([{ col: 1 }, { col: 1 }, { col: 1 }]);
    setIs3D(false);
  }

  return (
    <div
      className="w3-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Puzzle templates"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w3-modal w3-modal--wide">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w3-cat-ico" style={{ width: 40, height: 40, fontSize: 18 }}>🧩</span>
            <div>
              <h2 className="w3-modal-title">Puzzle templates</h2>
              <p className="w3-modal-kicker">Presets, or build your own</p>
            </div>
          </div>
          <button className="w3-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {!building && (
          <>
            <div className="w3-tpl-grid mt-4">
              {all.map((t) => (
                <button
                  key={t.id}
                  className="w3-tpl"
                  data-on={activeTemplateId === t.id}
                  onClick={() => onApply(t)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="w3-tpl-name">{t.name}</span>
                    {!t.builtin && (
                      <span
                        className="w3-x w3-danger"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(t.id);
                        }}
                        aria-label="Delete template"
                      >
                        ✕
                      </span>
                    )}
                  </div>
                  <p className="w3-tpl-meta">
                    {t.slots.length} slots · {t.is3D ? '3D curved' : '2D flat'}
                    {t.toggle2D3D ? ' · toggle' : ''}
                  </p>
                  <Preview slots={t.slots} />
                </button>
              ))}
            </div>

            <div className="mt-5 border-t border-cyan-400/10 pt-4">
              <button className="w3-primary w-full" onClick={() => setBuilding(true)}>
                ＋ Build your own
              </button>
            </div>
          </>
        )}

        {building && (
          <div className="mt-4 space-y-3">
            <input
              className="w3-field"
              placeholder="Template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div className="space-y-2">
              {slots.map((s, i) => (
                <div key={i} className="w3-slot-edit">
                  <span>Slot {i + 1}</span>
                  <div className="flex items-center gap-2">
                    <button className="w3-ghost" onClick={() => cycleSlot(i)}>
                      width {s.col}/3
                    </button>
                    <button className="w3-ghost" onClick={() => cycleRow(i)}>
                      {(s.rowSpan ?? 1) > 1 ? 'tall' : 'short'}
                    </button>
                    <button className="w3-x w3-danger" onClick={() => delSlot(i)} aria-label="Delete slot">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <button className="w3-ghost w-full" onClick={addSlot}>
              ＋ Add slot
            </button>
            <label className="flex items-center gap-2 text-[12px] text-slate-300">
              <button
                className="w3-toggle"
                data-on={is3D}
                onClick={() => setIs3D((v) => !v)}
                aria-pressed={is3D}
                aria-label="3D curve"
                type="button"
              />
              Curved 3D presentation
            </label>
            <div className="flex gap-2 pt-1">
              <button className="w3-primary" onClick={save} disabled={slots.length === 0}>
                Save template
              </button>
              <button className="w3-ghost" onClick={() => setBuilding(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
