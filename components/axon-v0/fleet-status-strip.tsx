'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { plainFleetStatus, plainRelativeTime, plainSurface } from '@/lib/axon-v0/plain-labels';
import './comms-feed.css';

type FleetStatus = 'LIVE' | 'STALE' | 'NEVER_SEEN' | 'DISABLED_BY_DESIGN';

interface FleetRow {
  agent_name: string;
  surface: string | null;
  last_seen_at: string | null;
  status: FleetStatus;
  last_action: string | null;
  has_live_schedule: boolean | null;
  drift_flag: boolean | null;
  authority_status: string | null;
}

const STATUS_CLASS: Record<FleetStatus, string> = {
  LIVE: 'cf-status-pill--live',
  STALE: 'cf-status-pill--stale',
  NEVER_SEEN: 'cf-status-pill--never',
  DISABLED_BY_DESIGN: 'cf-status-pill--off',
};

const POLL_MS = 30_000;

/** One row per agent: name, surface, last seen, live status, drift flag.
 *  Polls every 30s; pauses while the tab is hidden so a backgrounded dash
 *  doesn't keep hammering the fleet-status view. */
export function FleetStatusStrip() {
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    async function load() {
      if (document.hidden) return;
      try {
        const r = await fetch(apiUrl('/api/axon-v0/fleet-status'));
        const d = await r.json();
        if (!aliveRef.current) return;
        setRows(Array.isArray(d.items) ? d.items : []);
      } catch {
        /* keep last known rows on a transient failure */
      } finally {
        if (aliveRef.current) setLoading(false);
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

  if (loading) {
    return <div className="v0-panel p-4 text-sm text-slate-500">Loading fleet status…</div>;
  }

  if (!rows.length) {
    return <div className="v0-panel p-4 text-sm text-slate-500">No agents reporting yet.</div>;
  }

  return (
    <section className="v0-panel p-4">
      <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Fleet Status</p>
      <div className="v0-scroll mt-3 max-h-72 overflow-y-auto pr-1">
        {rows.map((row) => (
          <div key={row.agent_name} className="cf-fleet-row">
            <span className="truncate text-sm text-cyan-50">{row.agent_name}</span>
            <span className="truncate text-xs text-slate-400">{plainSurface(row.surface)}</span>
            <span className="text-xs text-slate-500">
              {plainRelativeTime(row.last_seen_at) || 'Never checked in'}
            </span>
            <span className="flex items-center justify-end gap-1.5">
              {row.drift_flag && <span className="cf-drift-flag">Drift</span>}
              <span className={`cf-status-pill ${STATUS_CLASS[row.status] || 'cf-status-pill--never'}`}>
                <span className="cf-status-dot" aria-hidden />
                {plainFleetStatus(row.status)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
