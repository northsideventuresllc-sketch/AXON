'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadPrefs,
  patchPrefs,
  type PanelBox,
  type WindowMode,
  type PuzzleTemplate,
  type CustomWidgetSpec,
} from '@/lib/axon-v0/view-prefs';
import { AXON_WIDGETS, WidgetCatalog, CustomWidgetCard } from './widget-catalog';
import { CustomWidgetMaker } from './custom-widget-maker';
import { PuzzleTemplates } from './puzzle-templates';
import './widgets-3d.css';

export interface HostPanel {
  id: string;
  title: string;
  node: React.ReactNode;
  /** default flow span (1 or 2 columns) */
  span?: 1 | 2;
}

const DEFAULT_BOX: PanelBox = { x: 4, y: 4, w: 30, h: 40, slot: 0, collapsed: false, hidden: false };
const DEFAULT_ACTIVE = ['todo', 'notifications', 'usage', 'shortcuts', 'quicklinks'];

export function WindowHost({ panels }: { panels: HostPanel[] }) {
  const [mode, setMode] = useState<WindowMode>('default');
  const [boxes, setBoxes] = useState<Record<string, PanelBox>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_ACTIVE);
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetSpec[]>([]);
  const [templates, setTemplates] = useState<PuzzleTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [widgetCurve, setWidgetCurve] = useState(35);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [makerOpen, setMakerOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = loadPrefs();
    setMode(p.windowMode);
    setActiveWidgets(p.activeWidgets?.length ? p.activeWidgets : DEFAULT_ACTIVE);
    setCustomWidgets(p.customWidgets || []);
    setTemplates(p.templates || []);
    setActiveTemplateId(p.activeTemplateId ?? null);
    setWidgetCurve(typeof p.widgetCurve === 'number' ? p.widgetCurve : 35);
    // seed any known panel (base + AXON + custom) with a stable slot order
    const known = [
      ...panels.map((x) => x.id),
      ...AXON_WIDGETS.map((w) => w.id),
      ...(p.customWidgets || []).map((c) => `custom:${c.id}`),
    ];
    const next = { ...p.panels };
    known.forEach((id, i) => {
      if (!next[id]) next[id] = { ...DEFAULT_BOX, slot: i, x: 4 + (i % 3) * 32, y: 4 + Math.floor(i / 3) * 34 };
    });
    setBoxes(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPanel = useCallback((id: string, patch: Partial<PanelBox>) => {
    setBoxes((prev) => {
      const next = { ...prev, [id]: { ...(prev[id] || DEFAULT_BOX), ...patch } };
      patchPrefs({ panels: next });
      return next;
    });
  }, []);

  function changeMode(m: WindowMode) {
    setMode(m);
    patchPrefs({ windowMode: m });
  }

  function setCurve(v: number) {
    setWidgetCurve(v);
    patchPrefs({ widgetCurve: v });
  }

  // ---- Widget catalog ----
  function toggleWidget(id: string) {
    setActiveWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      patchPrefs({ activeWidgets: next });
      return next;
    });
  }

  function onCustomCreated(spec: CustomWidgetSpec) {
    const nextCustom = [...customWidgets, spec];
    const nextActive = [...activeWidgets, `custom:${spec.id}`];
    setCustomWidgets(nextCustom);
    setActiveWidgets(nextActive);
    patchPrefs({ customWidgets: nextCustom, activeWidgets: nextActive });
    setMakerOpen(false);
  }

  function removeCustom(id: string) {
    const nextCustom = customWidgets.filter((c) => c.id !== id);
    const nextActive = activeWidgets.filter((x) => x !== `custom:${id}`);
    setCustomWidgets(nextCustom);
    setActiveWidgets(nextActive);
    patchPrefs({ customWidgets: nextCustom, activeWidgets: nextActive });
  }

  // ---- Puzzle templates ----
  function applyTemplate(tpl: PuzzleTemplate) {
    const registry = buildRegistry();
    const ordered = activeWidgets.map((id) => registry.get(id)).filter(Boolean) as HostPanel[];
    const next = { ...boxes };
    ordered.forEach((p, i) => {
      const slot = tpl.slots[i % Math.max(1, tpl.slots.length)] || { col: 1 };
      next[p.id] = { ...(next[p.id] || DEFAULT_BOX), slot: i, col: slot.col, rowSpan: slot.rowSpan || 1 };
    });
    const curve = tpl.is3D ? (widgetCurve > 0 ? widgetCurve : 45) : 0;
    setBoxes(next);
    setMode('puzzle');
    setActiveTemplateId(tpl.id);
    setWidgetCurve(curve);
    patchPrefs({ panels: next, windowMode: 'puzzle', activeTemplateId: tpl.id, widgetCurve: curve });
    setTemplatesOpen(false);
  }

  function saveTemplate(tpl: PuzzleTemplate) {
    const next = [...templates, tpl];
    setTemplates(next);
    patchPrefs({ templates: next });
  }

  function deleteTemplate(id: string) {
    const next = templates.filter((t) => t.id !== id);
    const clearActive = activeTemplateId === id;
    setTemplates(next);
    if (clearActive) setActiveTemplateId(null);
    patchPrefs({ templates: next, ...(clearActive ? { activeTemplateId: null } : {}) });
  }

  // ---- Free-flow drag ----
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const resize = useRef<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

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
    setActiveDragId(id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onResizePointerDown(e: React.PointerEvent, id: string) {
    if (mode !== 'free') return;
    e.stopPropagation();
    const box = boxes[id] || DEFAULT_BOX;
    resize.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startW: box.fw || 320,
      startH: box.fh || 220,
    };
    setActiveDragId(id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onHostPointerMove(e: React.PointerEvent) {
    if (mode !== 'free') return;
    if (drag.current) {
      const host = hostRef.current?.getBoundingClientRect();
      if (!host) return;
      const x = ((e.clientX - drag.current.dx - host.left) / host.width) * 100;
      const y = ((e.clientY - drag.current.dy - host.top) / host.height) * 100;
      setBoxes((prev) => ({
        ...prev,
        [drag.current!.id]: { ...(prev[drag.current!.id] || DEFAULT_BOX), x: clamp(x, 0, 96), y: clamp(y, 0, 96) },
      }));
    } else if (resize.current) {
      const r = resize.current;
      const w = clamp(r.startW + (e.clientX - r.startX), 200, 900);
      const h = clamp(r.startH + (e.clientY - r.startY), 120, 700);
      setBoxes((prev) => ({
        ...prev,
        [r.id]: { ...(prev[r.id] || DEFAULT_BOX), fw: Math.round(w), fh: Math.round(h) },
      }));
    }
  }

  function onHostPointerUp() {
    if (drag.current || resize.current) {
      patchPrefs({ panels: boxesRef.current });
      drag.current = null;
      resize.current = null;
      setActiveDragId(null);
    }
  }

  // keep a live ref of boxes so the pointerup persist reads the latest
  const boxesRef = useRef(boxes);
  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);

  // ---- panel registry ----
  function buildRegistry(): Map<string, HostPanel> {
    const axonPanels: HostPanel[] = AXON_WIDGETS.map((w) => ({
      id: w.id,
      title: w.name,
      node: <w.Comp />,
      span: w.span,
    }));
    const customPanels: HostPanel[] = customWidgets.map((c) => ({
      id: `custom:${c.id}`,
      title: c.name,
      node: <CustomWidgetCard spec={c} />,
      span: 1,
    }));
    const reg = new Map<string, HostPanel>();
    [...panels, ...axonPanels, ...customPanels].forEach((p) => reg.set(p.id, p));
    return reg;
  }

  const registry = buildRegistry();
  const mounted = activeWidgets.map((id) => registry.get(id)).filter(Boolean) as HostPanel[];
  const visible = mounted.filter((p) => !boxes[p.id]?.hidden);
  const puzzleOrdered = [...visible].sort((a, b) => (boxes[a.id]?.slot ?? 0) - (boxes[b.id]?.slot ?? 0));
  const rendered = mode === 'puzzle' ? puzzleOrdered : visible;

  const curveActive = mode !== 'free' && widgetCurve > 0;

  const modeBtn = (m: WindowMode, label: string) => (
    <button
      key={m}
      onClick={() => changeMode(m)}
      className={`v0-chip ${mode === m ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
    >
      {label}
    </button>
  );

  const containerClass =
    mode === 'free' ? '' : mode === 'puzzle' ? 'grid grid-cols-3 gap-4' : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div>
      <div className="w3-toolbar">
        <span className="mr-auto text-[10px] uppercase tracking-[0.3em] text-slate-500">Layout</span>

        {mode !== 'free' && (
          <label className="w3-curve-ctl" title="Curve depth of the 3D widget space">
            Curve
            <input
              type="range"
              className="w3-range"
              min={0}
              max={100}
              value={widgetCurve}
              onChange={(e) => setCurve(Number(e.target.value))}
              aria-label="Widget space curve"
            />
          </label>
        )}

        <button className="w3-tool-btn" onClick={() => setTemplatesOpen(true)} title="Puzzle templates">
          🧩 Templates
        </button>
        <button className="w3-tool-btn" onClick={() => setCatalogOpen(true)} title="Add or remove widgets">
          ▤ Widgets
        </button>

        {modeBtn('default', 'Default')}
        {modeBtn('puzzle', 'Puzzle')}
        {modeBtn('free', 'Free-Flow')}
      </div>

      <div
        ref={hostRef}
        className="v0-window-host"
        style={mode === 'free' ? { minHeight: '1200px' } : undefined}
        onPointerMove={onHostPointerMove}
        onPointerUp={onHostPointerUp}
      >
        <div className={containerClass} style={{ perspective: '1400px' }}>
          {rendered.map((panel, i) => {
            const box = boxes[panel.id] || DEFAULT_BOX;
            const collapsed = box.collapsed;

            // curved-arc transform, per 3-column position
            const colIndex = i % 3;
            const offset = colIndex - 1; // -1 | 0 | 1
            const factor = widgetCurve / 100;
            const ry = -offset * 26 * factor;
            const tz = -Math.abs(offset) * 90 * factor;

            const wrapStyle: React.CSSProperties = {};
            if (mode === 'puzzle') {
              wrapStyle.gridColumn = `span ${Math.min(3, Math.max(1, box.col || 1))}`;
              wrapStyle.gridRow = `span ${Math.min(2, Math.max(1, box.rowSpan || 1))}`;
            }
            if (curveActive) {
              (wrapStyle as Record<string, string | number>)['--w3-ry'] = `${ry}deg`;
              (wrapStyle as Record<string, string | number>)['--w3-tz'] = `${tz}px`;
            }

            const freeStyle: React.CSSProperties =
              mode === 'free'
                ? {
                    position: 'absolute',
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: box.fw ? `${box.fw}px` : 'min(92%, 320px)',
                    height: box.fh ? `${box.fh}px` : undefined,
                  }
                : {};

            const section = (
              <section
                key={mode === 'free' ? panel.id : undefined}
                data-mode={mode}
                onClick={() => setFocused((f) => (f === panel.id ? null : panel.id))}
                className={`v0-window v0-panel v0-swayer ${
                  focused === panel.id ? 'v0-sway-focus' : focused ? 'v0-sway-back' : ''
                } ${activeDragId === panel.id ? 'v0-dragging' : ''} ${
                  mode === 'default' && panel.span === 2 ? 'sm:col-span-2' : ''
                }`}
                style={mode === 'free' ? freeStyle : undefined}
              >
                <header className="flex items-center justify-between px-3 pt-3">
                  <span
                    className={`text-[10px] uppercase tracking-[0.3em] text-cyan-300/70 ${
                      mode === 'free' ? 'v0-window-grip' : ''
                    }`}
                    onPointerDown={mode === 'free' ? (e) => onFreePointerDown(e, panel.id) : undefined}
                  >
                    {mode === 'free' ? '⠿ ' : ''}
                    {panel.title}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPanel(panel.id, { collapsed: !collapsed });
                      }}
                      className="text-slate-500 hover:text-cyan-300"
                      aria-label={collapsed ? 'expand' : 'collapse'}
                    >
                      {collapsed ? '▸' : '▾'}
                    </button>
                  </div>
                </header>
                <div
                  className="v0-collapse-body px-1 pb-1"
                  data-open={!collapsed}
                  style={{ maxHeight: collapsed ? 0 : 2000 }}
                >
                  {panel.node}
                </div>
                {mode === 'free' && (
                  <div
                    className="w3-resize"
                    onPointerDown={(e) => onResizePointerDown(e, panel.id)}
                    aria-label="Resize"
                    role="separator"
                  />
                )}
              </section>
            );

            // free mode positions the section itself; grid modes wrap it so the
            // curve transform composes with the inner focus-sway transform.
            if (mode === 'free') return section;
            return (
              <div key={panel.id} className={curveActive ? 'w3-slot' : ''} style={wrapStyle}>
                {section}
              </div>
            );
          })}
        </div>
      </div>

      {catalogOpen && (
        <WidgetCatalog
          activeWidgets={activeWidgets}
          customWidgets={customWidgets}
          onToggle={toggleWidget}
          onRemoveCustom={removeCustom}
          onOpenMaker={() => {
            setCatalogOpen(false);
            setMakerOpen(true);
          }}
          onClose={() => setCatalogOpen(false)}
        />
      )}

      {makerOpen && <CustomWidgetMaker onClose={() => setMakerOpen(false)} onCreated={onCustomCreated} />}

      {templatesOpen && (
        <PuzzleTemplates
          templates={templates}
          activeTemplateId={activeTemplateId}
          onApply={applyTemplate}
          onSaveTemplate={saveTemplate}
          onDeleteTemplate={deleteTemplate}
          onClose={() => setTemplatesOpen(false)}
        />
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
