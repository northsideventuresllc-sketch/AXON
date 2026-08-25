'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import './widgets.css';

interface UsageConnector {
  id: string;
  label: string;
  category: string;
  spendMonth: number;
  capMonthly: number | null;
}

interface UsageResponse {
  ok?: boolean;
  live?: boolean;
  connectors?: UsageConnector[];
}

const TOP = 10;

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function UsageBar({ bare = false }: { bare?: boolean } = {}) {
  const [connectors, setConnectors] = useState<UsageConnector[]>([]);
  const [live, setLive] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon/usage'))
      .then((r) => r.json())
      .then((d: UsageResponse) => {
        if (!alive) return;
        const list = Array.isArray(d.connectors) ? d.connectors.slice() : [];
        list.sort((a, b) => (b.spendMonth || 0) - (a.spendMonth || 0));
        setConnectors(list);
        setLive(Boolean(d.live));
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setConnectors([]);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const max = Math.max(1, ...connectors.map((c) => Math.max(c.spendMonth || 0, c.capMonthly || 0)));
  const shown = showAll ? connectors : connectors.slice(0, TOP);

  return (
    <div className="space-y-2">
      {(!bare || live !== null) && (
        <div className="flex items-center justify-between">
          {bare ? <span /> : <span className="wg-head">Usage · Monthly spend</span>}
          {live !== null && (
            <span className="wg-sub">{live ? 'live' : 'sample data'}</span>
          )}
        </div>
      )}

      {loaded && connectors.length === 0 && (
        <p className="wg-sub">No connector usage to show yet.</p>
      )}

      <ul className="space-y-2">
        {shown.map((c) => {
          const cap = c.capMonthly;
          const spend = c.spendMonth || 0;
          const capped = cap != null && cap > 0;
          const over = capped && spend > cap;
          const pct = capped ? Math.min(1, spend / cap) : spend / max;
          return (
            <li key={c.id} className="wg-row">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] text-slate-200">{c.label}</span>
                <span className="wg-sub whitespace-nowrap">
                  {money(spend)}
                  {capped ? ` / ${money(cap)}` : ' · uncapped —'}
                </span>
              </div>
              <div className="wg-meter">
                <div
                  className={`wg-meter-fill${over ? ' wg-over' : ''}${capped ? '' : ' wg-uncapped'}`}
                  style={{ transform: `scaleX(${Math.max(0.02, pct)})` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {connectors.length > TOP && (
        <button className="wg-link" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'show less' : `show all (${connectors.length})`}
        </button>
      )}
    </div>
  );
}

export default UsageBar;
