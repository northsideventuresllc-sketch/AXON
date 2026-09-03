'use client';

import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import {
  plainHarnessBucket,
  plainRelativeTime,
  plainRunMode,
  rosterHarnessBucket,
  rosterHealthChip,
  rosterHealthChipClass,
} from '@/lib/axon-v0/plain-labels';
import './comms-feed.css';

interface RosterRow {
  agent_name: string;
  wake_type: string | null;
  harness: string | null;
  llm_provider: string | null;
  model: string | null;
  health_status: string | null;
  health_note: string | null;
  last_fired_at: string | null;
  retired_at: string | null;
}

const POLL_MS = 10_000;
const HARNESS_ORDER = ['axon_v0', 'claude_code', 'mac_mini', 'hermes', 'supabase', 'other'];

type FireState = { loading: boolean; ok: boolean | null; message: string | null };

/**
 * Fleet tab — every `nvg_agent_routines` row, grouped into the five allowed harnesses,
 * with a Fire button per row (POST /api/axon-v0/roster/fire). 10s poll. Never renders a
 * raw db value: health/harness/wake type all go through lib/axon-v0/plain-labels.
 */
export function RosterFleetPanel() {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fireState, setFireState] = useState<Record<string, FireState>>({});
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    async function load() {
      if (document.hidden) return;
      try {
        const r = await fetch(apiUrl('/api/axon-v0/roster'));
        const d = await r.json();
        if (!aliveRef.current) return;
        setRows(Array.isArray(d.rows) ? d.rows : []);
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

  async function fire(agentName: string) {
    setFireState((s) => ({ ...s, [agentName]: { loading: true, ok: null, message: null } }));
    try {
      const r = await fetch(apiUrl('/api/axon-v0/roster/fire'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_name: agentName }),
      });
      const d = await r.json();
      setFireState((s) => ({
        ...s,
        [agentName]: {
          loading: false,
          ok: !!d.fired,
          message: d.fired ? `Fired (${d.how})` : d.reason || 'Could not fire',
        },
      }));
    } catch {
      setFireState((s) => ({
        ...s,
        [agentName]: { loading: false, ok: false, message: 'Could not reach the fire route' },
      }));
    }
  }

  if (loading) {
    return <div className="v0-panel p-4 text-sm text-slate-500">Loading the fleet…</div>;
  }
  if (!rows.length) {
    return <div className="v0-panel p-4 text-sm text-slate-500">No agents in the roster yet.</div>;
  }

  const groups = new Map<string, RosterRow[]>();
  for (const row of rows) {
    const bucket = rosterHarnessBucket(row.harness);
    const list = groups.get(bucket) ?? [];
    list.push(row);
    groups.set(bucket, list);
  }

  return (
    <section className="v0-panel p-4">
      <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Fleet</p>
      <div className="v0-scroll mt-3 max-h-[32rem] overflow-y-auto pr-1">
        {HARNESS_ORDER.filter((b) => groups.has(b)).map((bucket) => (
          <div key={bucket} className="cf-roster-group">
            <p className="cf-roster-group-title">{plainHarnessBucket(bucket)}</p>
            {groups.get(bucket)!.map((row) => {
              const chip = rosterHealthChip(row.health_status, row.retired_at, row.last_fired_at);
              const state = fireState[row.agent_name];
              return (
                <div key={row.agent_name} className="cf-roster-row">
                  <span className="truncate text-sm text-cyan-50">{row.agent_name}</span>
                  <span className="truncate text-xs text-slate-400">
                    {plainRunMode(row.llm_provider, row.model, row.wake_type)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {plainRelativeTime(row.last_fired_at) || 'Never fired'}
                  </span>
                  <span className={`cf-status-pill ${rosterHealthChipClass(chip)}`}>
                    <span className="cf-status-dot" aria-hidden />
                    {chip}
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      className="cf-fire-btn"
                      disabled={!!row.retired_at || state?.loading}
                      onClick={() => fire(row.agent_name)}
                    >
                      {state?.loading ? 'Firing…' : 'Fire'}
                    </button>
                    {state?.message && (
                      <span className={`cf-fire-result ${state.ok ? 'cf-fire-result--ok' : 'cf-fire-result--err'}`}>
                        {state.message}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
