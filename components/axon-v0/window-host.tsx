'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPrefs,
  patchPrefs,
  type PanelBox,
  type WindowMode,
} from '@/lib/axon-v0/view-prefs';

export interface HostPanel {
  id: string;
  title: string;
  node: React.ReactNode;
  /** default flow span (1 or 2 columns) */
  span?: 1 | 2;
}

const DEFAULT_BOX: PanelBox = { x: 4, y: 4, w: 30, h: 40, slot: 0, collapsed: false, hidden: false };

export function WindowHost({ panels }: { panels: HostPanel[] }) {
  const [mode, setMode] = useState<WindowMode>('default');
  const [boxes, setBoxes] = useState<Record<string, PanelBox>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = loadPrefs();
    setMode(p.windowMode);
    // seed any missing panels with defaults + a stable slot order
    const next = { ...p.panels };
    panels.forEach((panel, i) => {
      if (!next[panel.id]) next[panel.id] = { ...DEFAULT_BOX, slot: i, x: 4 + (i % 3) * 32, y: 4 + Math.floor(i / 3) * 34 };
    });
    setBoxes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((nextBoxes: Record<string, PanelBox>, nextMode?: WindowMode) => {
    setBoxes(nextBoxes);
    patchPrefs({ panels: nextBoxes, ...(nextMode ? { windowMode: nextMode } : {}) });
  }, []);

  const setPanel = useCallback(
    (id: string, patch: Partial<PanelBox>) => {
      setBoxes((prev) => {
        const next = { ...prev, [id]: { ...(prev[id] || DEFAULT_BOX), ...patch } };
        patchPrefs({ panels: next });
        return next;
      });
    },
    []
  );

  function changeMode(m: WindowMode) {
    setMode(m);
    patchPrefs({ windowMode: m });
  }

  // ---- Free-flow drag ----
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  function onFreePointerDown(e: React.PointerEvent, id: string) {
    if (mode !== 'free') return;
    const host = hostRef.current?.getBoundingClientRect();
    const box = boxes[id] || DEFAULT_BOX;
    if (!host) return;
    drag.current = {
      id,
      dx: e.clientX - (host.left + (box.x / 100) * host.width),
      dy: e.clientY - (host.top + (box.y / 100) * host.height),
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onFreePointerMove(e: React.PointerEvent) {
    if (!drag.current || mode !== 'free') return;
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return;
    const x = ((e.clientX - drag.current.dx - host.left) / host.width) * 100;
    const y = ((e.clientY - drag.current.dy - host.top) / host.height) * 100;
    setBoxes((prev) => ({
      ...prev,
      [drag.current!.id]: { ...(prev[drag.current!.id] || DEFAULT_BOX), x: clamp(x, 0, 82), y: clamp(y, 0, 88) },
    }));
  }
  function onFreePointerUp() {
    if (drag.current) {
      patchPrefs({ panels: boxes });
      drag.current = null;
    }
  }

  // ---- Puzzle slot swap ----
  function movePuzzle(id: string, dir: -1 | 1) {
    const ordered = [...panels].sort((a, b) => (boxes[a.id]?.slot ?? 0) - (boxes[b.id]?.slot ?? 0));
    const idx = ordered.findIndex((p) => p.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ordered.length) return;
    const a = ordered[idx].id;
    const b = ordered[swap].id;
    const next = {
      ...boxes,
      [a]: { ...(boxes[a] || DEFAULT_BOX), slot: boxes[b]?.slot ?? swap },
      [b]: { ...(boxes[b] || DEFAULT_BOX), slot: boxes[a]?.slot ?? idx },
    };
    persist(next);
  }

  const modeBtn = (m: WindowMode, label: string) => (
    <button
      key={m}
      onClick={() => changeMode(m)}
      className={`v0-chip ${mode === m ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
    >
      {label}
    </button>
  );

  const visible = panels.filter((p) => !boxes[p.id]?.hidden);
  const puzzleOrdered = [...visible].sort((a, b) => (boxes[a.id]?.slot ?? 0) - (boxes[b.id]?.slot ?? 0));

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-1.5">
        <span className="mr-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">Layout</span>
        {modeBtn('default', 'Default')}
        {modeBtn('puzzle', 'Puzzle')}
        {modeBtn('free', 'Free-Flow')}
      </div>

      <div
        ref={hostRef}
        className="v0-window-host"
        style={mode === 'free' ? { minHeight: '70vh' } : undefined}
        onPointerMove={onFreePointerMove}
        onPointerUp={onFreePointerUp}
      >
        <div
          className={mode === 'free' ? '' : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'}
          style={{ perspective: '1400px' }}
        >
          {(mode === 'puzzle' ? puzzleOrdered : visible).map((panel) => {
            const box = boxes[panel.id] || DEFAULT_BOX;
            const collapsed = box.collapsed;
            const freeStyle: React.CSSProperties =
              mode === 'free'
                ? { position: 'absolute', left: `${box.x}%`, top: `${box.y}%`, width: `min(92%, 320px)` }
                : {};
            return (
              <section
                key={panel.id}
                data-mode={mode}
                onClick={() => setFocused((f) => (f === panel.id ? null : panel.id))}
                className={`v0-window v0-panel v0-swayer ${
                  focused === panel.id ? 'v0-sway-focus' : focused ? 'v0-sway-back' : ''
                } ${mode === 'default' && panel.span === 2 ? 'sm:col-span-2' : ''}`}
                style={freeStyle}
              >
                <header className="flex items-center justify-between px-3 pt-3">
                  <span
                    className={`text-[10px] uppercase tracking-[0.3em] text-cyan-300/70 ${mode === 'free' ? 'v0-window-grip' : ''}`}
                    onPointerDown={mode === 'free' ? (e) => onFreePointerDown(e, panel.id) : undefined}
                  >
                    {mode === 'free' ? '⠿ ' : ''}
                    {panel.title}
                  </span>
                  <div className="flex items-center gap-1">
                    {mode === 'puzzle' && (
                      <>
                        <button onClick={() => movePuzzle(panel.id, -1)} className="text-slate-500 hover:text-cyan-300" aria-label="move left">◀</button>
                        <button onClick={() => movePuzzle(panel.id, 1)} className="text-slate-500 hover:text-cyan-300" aria-label="move right">▶</button>
                      </>
                    )}
                    <button
                      onClick={() => setPanel(panel.id, { collapsed: !collapsed })}
                      className="text-slate-500 hover:text-cyan-300"
                      aria-label={collapsed ? 'expand' : 'collapse'}
                    >
                      {collapsed ? '▸' : '▾'}
                    </button>
                  </div>
                </header>
                <div className="v0-collapse-body px-1 pb-1" data-open={!collapsed} style={{ maxHeight: collapsed ? 0 : 2000 }}>
                  {panel.node}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
