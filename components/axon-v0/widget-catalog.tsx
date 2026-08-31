'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import type { CustomWidgetSpec } from '@/lib/axon-v0/view-prefs';
import { plainToolkitBuildStatus } from '@/lib/axon-v0/plain-labels';
import './widgets.css';
import './widgets-3d.css';

/**
 * Build-2 widget catalog: the drawer that adds/removes widgets from the home
 * space, plus the four new lightweight AXON widgets. Each new widget fetches an
 * existing /api endpoint where one obviously fits and degrades to an honest,
 * clearly-labelled placeholder otherwise — no new API routes are introduced.
 */

/* ---------------------------------------------------------------------------
 * New AXON widgets
 * ------------------------------------------------------------------------- */

export function FireGateWidget() {
  const [mode, setMode] = useState<'FIRE' | 'HOLD' | null>(null);
  const [source, setSource] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon/fire-gate'))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setMode(d?.mode === 'FIRE' ? 'FIRE' : 'HOLD');
        setSource(typeof d?.source === 'string' ? d.source : '');
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setMode('HOLD'); // fail safe — mirror the gate itself
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-2 px-1 pb-1">
      <div className="flex items-center justify-between">
        <span className={`w3-pill ${mode === 'FIRE' ? 'w3-pill--fire' : 'w3-pill--hold'}`}>
          <span className="w3-dot" aria-hidden />
          {mode ?? '…'}
        </span>
        {source && <span className="wg-sub">{source}</span>}
      </div>
      <p className="wg-sub leading-relaxed">
        {mode === 'FIRE'
          ? 'Outreach sends, dispatch fires, cron and publishing are ARMED.'
          : 'Sends, dispatch, cron and publishing are held. JB flips the gate to fire.'}
        {failed && ' Gate unreachable — showing fail-safe HOLD.'}
      </p>
    </div>
  );
}

export function AgentFeedWidget() {
  const [rows, setRows] = useState<{ id: string; name: string; status: string; venture: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon-v0/agents'))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const groups = Array.isArray(d?.groups) ? d.groups : [];
        const flat: { id: string; name: string; status: string; venture: string }[] = [];
        for (const g of groups) {
          for (const a of g.agents || []) {
            flat.push({ id: a.id, name: a.name, status: a.status, venture: g.ventureName });
          }
        }
        setRows(flat);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const running = rows.filter((r) => r.status === 'running').length;
  const blocked = rows.filter((r) => r.status === 'blocked' || r.status === 'failed').length;

  return (
    <div className="space-y-2 px-1 pb-1">
      <div className="flex items-center gap-4">
        <span className="w3-stat">
          <span className="w3-stat-num">{running}</span>
          <span className="w3-stat-lbl">running</span>
        </span>
        <span className="w3-stat">
          <span className="w3-stat-num">{blocked}</span>
          <span className="w3-stat-lbl">blocked</span>
        </span>
      </div>
      <ul className="space-y-1 pt-0.5">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-[12px] text-slate-300">
            <span
              className="w3-dot"
              style={{ color: r.status === 'running' ? '#00d4ff' : r.status === 'blocked' || r.status === 'failed' ? '#fb7185' : '#64748b' }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="wg-sub whitespace-nowrap">{r.venture}</span>
          </li>
        ))}
        {loaded && rows.length === 0 && <li className="wg-sub">No venture agents reporting yet.</li>}
      </ul>
    </div>
  );
}

export function BrainPulseWidget() {
  const [tables, setTables] = useState<{ key: string; label: string; count: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon-v0/brain-graph'))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setTables(Array.isArray(d?.tables) ? d.tables : []);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-2 px-1 pb-1">
      <div className="flex flex-wrap gap-4">
        {tables.map((t) => (
          <span key={t.key} className="w3-stat">
            <span className="w3-stat-num">{t.count}</span>
            <span className="w3-stat-lbl">{t.label}</span>
          </span>
        ))}
      </div>
      <p className="wg-sub">
        {loaded && tables.length === 0
          ? 'NI-Brain pulse unavailable right now.'
          : 'Recent NI-Brain rows across Decisions, Learnings and Context.'}
      </p>
    </div>
  );
}

export function VentureStatsWidget() {
  const [ventures, setVentures] = useState<{ id: string; name: string; agents: number; tools: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon-v0/ventures'))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d?.ventures) ? d.ventures : [];
        setVentures(
          list.map((v: { id: string; name: string; agents?: unknown[]; tools?: unknown[] }) => ({
            id: v.id,
            name: v.name,
            agents: Array.isArray(v.agents) ? v.agents.length : 0,
            tools: Array.isArray(v.tools) ? v.tools.length : 0,
          }))
        );
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totalAgents = ventures.reduce((n, v) => n + v.agents, 0);

  return (
    <div className="space-y-2 px-1 pb-1">
      <div className="flex items-center gap-4">
        <span className="w3-stat">
          <span className="w3-stat-num">{ventures.length}</span>
          <span className="w3-stat-lbl">ventures</span>
        </span>
        <span className="w3-stat">
          <span className="w3-stat-num">{totalAgents}</span>
          <span className="w3-stat-lbl">agents</span>
        </span>
      </div>
      <ul className="space-y-1 pt-0.5">
        {ventures.slice(0, 5).map((v) => (
          <li key={v.id} className="flex items-center gap-2 text-[12px] text-slate-300">
            <span className="min-w-0 flex-1 truncate">{v.name}</span>
            <span className="wg-sub whitespace-nowrap">
              {v.agents} agent{v.agents === 1 ? '' : 's'} · {v.tools} tool{v.tools === 1 ? '' : 's'}
            </span>
          </li>
        ))}
        {loaded && ventures.length === 0 && <li className="wg-sub">No ventures yet.</li>}
      </ul>
    </div>
  );
}

/**
 * Rendered body for a user-drafted custom widget. The spec itself still isn't live
 * runtime code (item #10's honest scope — see lib/axon-toolkit-build.mjs), but it no
 * longer dead-ends here: `buildStatus` reflects what actually happened when it was
 * handed to the venture's Build Manager (dispatched via fireAgent, gated by FIRE/HOLD).
 */
export function CustomWidgetCard({ spec }: { spec: CustomWidgetSpec }) {
  return (
    <div className="space-y-2 px-1 pb-1">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-slate-200">
          {spec.icon || '✦'} {spec.name}
        </span>
        <span className="w3-placeholder">{plainToolkitBuildStatus(spec.buildStatus)}</span>
      </div>
      <p className="wg-sub leading-relaxed">{spec.summary}</p>
      <p className="wg-sub">{spec.buildNote || 'Spec saved. Live provisioning of the widget itself comes next.'}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Catalog metadata + drawer
 * ------------------------------------------------------------------------- */

export interface CatalogWidget {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: 'core' | 'axon';
}

/** The five existing home widgets (nodes come from home-deck via props). */
export const CORE_WIDGETS: CatalogWidget[] = [
  { id: 'todo', name: 'Master To-Do', desc: 'Your rolling task list.', icon: '✓', category: 'core' },
  { id: 'notifications', name: 'Notifications', desc: 'Signals from across the system.', icon: '◈', category: 'core' },
  { id: 'usage', name: 'Usage', desc: 'Monthly connector spend.', icon: '$', category: 'core' },
  { id: 'shortcuts', name: 'Shortcuts', desc: 'Deep-links into a venture.', icon: '↗', category: 'core' },
  { id: 'quicklinks', name: 'Quick Links', desc: 'Fast jumps out to the web.', icon: '⚡', category: 'core' },
];

/** New AXON widgets — id, catalog copy, and the component to mount. */
export const AXON_WIDGETS: (CatalogWidget & { span?: 1 | 2; Comp: () => React.ReactElement })[] = [
  {
    id: 'axon-fire',
    name: 'FIRE / HOLD Gate',
    desc: 'Live state of the outreach/dispatch safety gate.',
    icon: '⚑',
    category: 'axon',
    span: 1,
    Comp: FireGateWidget,
  },
  {
    id: 'axon-agents',
    name: 'Agent Activity',
    desc: 'Which venture agents are running or blocked.',
    icon: '⧉',
    category: 'axon',
    span: 1,
    Comp: AgentFeedWidget,
  },
  {
    id: 'axon-brain',
    name: 'Brain Pulse',
    desc: 'Recent NI-Brain decisions, learnings, context.',
    icon: '◉',
    category: 'axon',
    span: 1,
    Comp: BrainPulseWidget,
  },
  {
    id: 'axon-ventures',
    name: 'Venture Quick-Stats',
    desc: 'Ventures, agents and tools at a glance.',
    icon: '◫',
    category: 'axon',
    span: 1,
    Comp: VentureStatsWidget,
  },
];

export const ALL_CATALOG: CatalogWidget[] = [...CORE_WIDGETS, ...AXON_WIDGETS];

export function WidgetCatalog({
  activeWidgets,
  customWidgets,
  onToggle,
  onRemoveCustom,
  onOpenMaker,
  onClose,
}: {
  activeWidgets: string[];
  customWidgets: CustomWidgetSpec[];
  onToggle: (id: string) => void;
  onRemoveCustom: (id: string) => void;
  onOpenMaker: () => void;
  onClose: () => void;
}) {
  const active = new Set(activeWidgets);

  const row = (w: CatalogWidget) => {
    const on = active.has(w.id);
    return (
      <div key={w.id} className="w3-cat-row" data-on={on}>
        <span className="w3-cat-ico">{w.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="w3-cat-name">{w.name}</span>
            {w.category === 'axon' && <span className="w3-tag">AXON</span>}
          </div>
          <p className="w3-cat-desc truncate">{w.desc}</p>
        </div>
        <button
          className="w3-toggle"
          data-on={on}
          onClick={() => onToggle(w.id)}
          aria-label={on ? `Remove ${w.name}` : `Add ${w.name}`}
          aria-pressed={on}
        />
      </div>
    );
  };

  return (
    <div
      className="w3-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Widget catalog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w3-modal w3-modal--wide">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="w3-modal-title">Widgets</h2>
            <p className="w3-modal-kicker">Add or remove from your space</p>
          </div>
          <button className="w3-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="mt-4 space-y-2">
          {CORE_WIDGETS.map(row)}
          <p className="pt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/50">AXON widgets</p>
          {AXON_WIDGETS.map(row)}
        </div>

        {customWidgets.length > 0 && (
          <>
            <p className="pt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/50">Custom</p>
            <div className="mt-2 space-y-2">
              {customWidgets.map((c) => {
                const id = `custom:${c.id}`;
                const on = active.has(id);
                return (
                  <div key={c.id} className="w3-cat-row" data-on={on}>
                    <span className="w3-cat-ico">{c.icon || '✦'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w3-cat-name">{c.name}</span>
                        <span className="w3-tag">{plainToolkitBuildStatus(c.buildStatus).toUpperCase()}</span>
                      </div>
                      <p className="w3-cat-desc truncate">{c.summary}</p>
                    </div>
                    <button className="w3-x w3-danger" onClick={() => onRemoveCustom(c.id)} aria-label="Delete custom widget">✕</button>
                    <button className="w3-toggle" data-on={on} onClick={() => onToggle(id)} aria-label={on ? 'Remove' : 'Add'} aria-pressed={on} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-5 border-t border-cyan-400/10 pt-4">
          <button className="w3-primary w-full" onClick={onOpenMaker}>
            ＋ Create custom widget
          </button>
        </div>
      </div>
    </div>
  );
}
