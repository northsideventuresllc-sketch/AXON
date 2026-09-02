'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { plainCommsSource, plainCommsStatus, plainRelativeTime } from '@/lib/axon-v0/plain-labels';
import './comms-feed.css';

type CommsSource = 'bus' | 'slack' | 'telegram' | 'task';

interface CommsRow {
  source: CommsSource;
  ref: string;
  agent_name: string;
  target: string | null;
  title: string | null;
  body: string | null;
  status: string | null;
  created_at: string;
}

const POLL_MS = 5_000;
const STALE_MS = 20_000;
const PAGE_LIMIT = 100;

function rowKey(row: CommsRow): string {
  return `${row.source}:${row.ref}`;
}

function CommsRowView({ row }: { row: CommsRow }) {
  const [expanded, setExpanded] = useState(false);
  const status = plainCommsStatus(row.status);

  return (
    <div className="cf-row p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`cf-source-chip cf-source-chip--${row.source}`}>{plainCommsSource(row.source)}</span>
        <span className="truncate text-sm text-cyan-50">{row.agent_name}</span>
        {row.target && <span className="text-xs text-slate-500">→ {row.target}</span>}
        {status && <span className="v0-chip text-slate-400">{status}</span>}
        <span className="ml-auto text-[10px] text-slate-600">{plainRelativeTime(row.created_at)}</span>
      </div>

      {row.title && <p className="mt-1.5 text-xs text-slate-300">{row.title}</p>}

      {row.body && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1 block w-full text-left text-[11px] leading-relaxed text-slate-500 ${
            expanded ? '' : 'cf-body-clamp'
          }`}
        >
          {row.body}
        </button>
      )}
    </div>
  );
}

/** Merged live timeline over agent_bus / Slack / Telegram / the task log.
 *  Polls every 5s (pauses while the tab is hidden), newest first, with a
 *  search box and an agent filter populated from the fleet-status view. */
export function AgentCommsFeed() {
  const [rows, setRows] = useState<CommsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastPolledAt, setLastPolledAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [agents, setAgents] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(apiUrl(`/api/axon-v0/comms-feed?limit=${PAGE_LIMIT}`));
      const d = await r.json();
      if (!aliveRef.current) return;
      setRows(Array.isArray(d.items) ? d.items : []);
      setLastPolledAt(Date.now());
    } catch {
      /* keep last known rows on a transient failure — the Live pill goes amber instead */
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Ticks the "how stale is the Live pill" clock without re-polling.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Agent filter list — a light one-time fetch of the fleet roster, independent
  // of FleetStatusStrip's own polling instance.
  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon-v0/fleet-status'))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const names = Array.isArray(d.items)
          ? Array.from(new Set(d.items.map((i: { agent_name: string }) => i.agent_name))).sort()
          : [];
        setAgents(names as string[]);
      })
      .catch(() => {
        if (alive) setAgents([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (agentFilter !== 'all' && row.agent_name !== agentFilter) return false;
      if (!term) return true;
      return (
        (row.title || '').toLowerCase().includes(term) ||
        (row.body || '').toLowerCase().includes(term) ||
        row.agent_name.toLowerCase().includes(term)
      );
    });
  }, [rows, agentFilter, search]);

  const stale = lastPolledAt == null || now - lastPolledAt > STALE_MS;

  return (
    <section className="v0-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Agent Comms</p>
        <span className={`cf-live-pill ${stale ? 'cf-live-pill--stale' : ''}`}>
          <span className="cf-live-dot" aria-hidden />
          {stale ? 'Reconnecting' : 'Live'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search comms…"
          className="min-w-[10rem] flex-1 rounded-lg border border-cyan-400/15 bg-black/30 px-3 py-1.5 text-xs text-cyan-50 placeholder:text-slate-600 focus:border-cyan-400/40 focus:outline-none"
        />
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="rounded-lg border border-cyan-400/15 bg-black/30 px-2 py-1.5 text-xs text-cyan-50 focus:border-cyan-400/40 focus:outline-none"
        >
          <option value="all">All agents</option>
          {agents.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="v0-scroll mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {loading && <p className="text-xs text-slate-500">Loading comms…</p>}
        {!loading && visible.length === 0 && (
          <p className="text-xs text-slate-500">Nothing matches — all quiet.</p>
        )}
        {visible.map((row) => (
          <CommsRowView key={rowKey(row)} row={row} />
        ))}
      </div>
    </section>
  );
}
