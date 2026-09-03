'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import './widgets.css';

interface UsageRunwayRow {
  provider: string;
  metric: string;
  used: number | null;
  limit: number | null;
  pct_used: number | null;
  days_left: number | null;
  resets_at: string | null;
  sampled_at: string | null;
}

const POLL_MS = 60_000;
const RED_DAYS_LEFT = 7;

function plainProvider(provider: string): string {
  const spaced = provider.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : provider;
}

function plainResets(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = then - Date.now();
  if (diffMs <= 0) return 'resets now';
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 24) return `resets in ${hours}h`;
  const days = Math.round(hours / 24);
  return `resets in ${days}d`;
}

/**
 * AXON v0 "Usage" strip — Phase 2 lane A4/B1 (agentic-os-phase2-harness-usage.md Phase B).
 * One bar per provider from v_usage_runway (built by lane B1 in parallel); if the view
 * doesn't exist yet, /api/axon-v0/usage still 200s with { rows: [] } and this renders
 * "No usage data yet" rather than erroring. days_left under 7 renders red.
 */
export function UsageRunwayStrip({ bare = false }: { bare?: boolean } = {}) {
  const [rows, setRows] = useState<UsageRunwayRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    async function load() {
      if (document.hidden) return;
      try {
        const r = await fetch(apiUrl('/api/axon-v0/usage'));
        const d = await r.json();
        if (!aliveRef.current) return;
        setRows(Array.isArray(d.rows) ? d.rows : []);
      } catch {
        /* keep last known rows on a transient failure */
      } finally {
        if (aliveRef.current) setLoaded(true);
      }
    }

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
  }, []);

  const body = !loaded ? (
    <p className="wg-sub">Loading usage…</p>
  ) : !rows.length ? (
    <p className="wg-sub">No usage data yet.</p>
  ) : (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = Math.max(0, Math.min(100, (row.pct_used ?? 0) * 100));
        const red = row.days_left !== null && row.days_left !== undefined && row.days_left < RED_DAYS_LEFT;
        const resets = plainResets(row.resets_at);
        return (
          <div key={`${row.provider}:${row.metric}`} className="wg-row">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-cyan-50">
                {plainProvider(row.provider)}
                <span className="ml-1 text-slate-500">{row.metric.replace(/_/g, ' ')}</span>
              </span>
              <span className={`shrink-0 text-xs ${red ? 'text-rose-400' : 'text-slate-400'}`}>
                {row.days_left !== null && row.days_left !== undefined
                  ? `${row.days_left}d left`
                  : resets || '—'}
              </span>
            </div>
            <div className="wg-meter mt-1">
              <div
                className={`wg-meter-fill ${pct >= 90 || red ? 'wg-over' : ''}`}
                style={{ transform: `scaleX(${pct / 100})` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  if (bare) {
    return <div className="space-y-2">{body}</div>;
  }

  return (
    <section className="v0-panel p-4">
      <p className="wg-head">Usage</p>
      <div className="mt-3">{body}</div>
    </section>
  );
}
