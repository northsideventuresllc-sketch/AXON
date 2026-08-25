'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import BrainScene, { type GraphNode, type GraphLink, type FocusRequest } from '@/components/axon-v0/brain-scene';
import { BrainCli } from '@/components/axon-v0/brain-cli';
import '@/components/axon-v0/brain.css';

interface BrainTable {
  key: string;
  label: string;
  kind: string;
  source: string;
  count: number;
}

const KIND_HEX: Record<GraphNode['kind'], string> = {
  hub: '#00d4ff',
  decision: '#7dd3fc',
  learning: '#34d399',
  context: '#c084fc',
};

const LEGEND: Array<{ kind: GraphNode['kind']; label: string; blurb: string }> = [
  { kind: 'hub', label: 'hub', blurb: 'The three roots of the brain — Decisions, Learnings and Context. Every memory hangs off one of them.' },
  { kind: 'decision', label: 'decisions', blurb: 'Choices logged to NI-Brain — what was decided and why, so the reasoning is never lost.' },
  { kind: 'learning', label: 'learnings', blurb: 'Lessons captured from work — corrections, discoveries and things proven true or false.' },
  { kind: 'context', label: 'context', blurb: "Current project state — what's live, what's in flight, and where things stand right now." },
];

export default function BrainPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [tables, setTables] = useState<BrainTable[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [fullscreen, setFullscreen] = useState(false);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  const [picked, setPicked] = useState<GraphNode | null>(null);

  const [query, setQuery] = useState('');
  const [legendOpen, setLegendOpen] = useState<GraphNode['kind'] | null>(null);
  const nonceRef = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('/api/axon-v0/brain-graph'))
      .then((r) => r.json())
      .then((d: { nodes?: GraphNode[]; links?: GraphLink[]; tables?: BrainTable[]; error?: string }) => {
        if (!alive) return;
        setNodes(d.nodes || []);
        setLinks(d.links || []);
        setTables(d.tables || []);
        if (!(d.nodes || []).length) setError(d.error || 'The brain returned no memories yet.');
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError('Could not reach the brain.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Esc exits fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const flyTo = (id: string) => {
    nonceRef.current += 1;
    setFocus({ id, nonce: nonceRef.current });
    const n = nodes.find((x) => x.id === id) || null;
    setPicked(n);
  };

  const memNodes = useMemo(() => nodes.filter((n) => n.kind !== 'hub'), [nodes]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return memNodes.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 12);
  }, [query, memNodes]);

  const data = useMemo(() => ({ nodes, links }), [nodes, links]);

  const scene = (
    <BrainScene data={data} fullscreen={fullscreen} focus={focus} onPick={(n) => setPicked(n)} />
  );

  return (
    <div className="mx-auto max-w-6xl">
      {/* ---- Header ---- */}
      <div className="flex items-end justify-between">
        <div>
          <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
            ← Command deck
          </Link>
          <h1 className="v0-neon mt-1 text-3xl">BRAIN</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your real decisions, learnings and context — a living star-map. Drag to orbit, scroll to zoom, hover a star
            for its title, search to fly to a memory.
          </p>
        </div>
        {!loading && (
          <p className="font-mono text-[11px] text-slate-500">
            {nodes.length} nodes · {links.length} links
          </p>
        )}
      </div>

      {/* ---- Search chat ---- */}
      <div className="relative mt-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the brain — type to find a memory, click a result to fly there…"
          className="w-full rounded-xl border border-cyan-400/20 bg-black/40 px-4 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
          aria-label="Search the brain"
        />
        {results.length > 0 && (
          <div className="v0-rise absolute z-40 mt-1 max-h-72 w-full space-y-1 overflow-y-auto rounded-xl border border-cyan-400/20 bg-black/90 p-2 backdrop-blur">
            {results.map((n) => (
              <button
                key={n.id}
                className="bn-result"
                onClick={() => {
                  flyTo(n.id);
                  setQuery('');
                }}
              >
                <span className="mr-2" style={{ color: KIND_HEX[n.kind] }}>
                  ●
                </span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500">{n.kind}</span>
                <span className="ml-2">{n.label.slice(0, 70)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- Graph (inline or fullscreen) ---- */}
      <div className="relative mt-4">
        {!fullscreen && (
          <>
            <div className="v0-panel h-[60vh] w-full overflow-hidden">{scene}</div>
            <button
              onClick={() => setFullscreen(true)}
              className="v0-chip absolute right-3 top-3 z-20 bg-black/50 text-cyan-100"
              aria-label="Expand to fullscreen"
            >
              ⤢ Expand
            </button>
            {picked && (
              <div className="v0-rise absolute bottom-4 left-4 max-w-sm rounded-xl border border-cyan-400/30 bg-black/80 p-4 backdrop-blur">
                <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: KIND_HEX[picked.kind] }}>
                  {picked.kind}
                </p>
                <p className="mt-1 text-sm text-slate-100">{picked.label}</p>
                {picked.at && (
                  <p className="mt-2 font-mono text-[10px] text-slate-500">{new Date(picked.at).toLocaleString()}</p>
                )}
                <button
                  onClick={() => setPicked(null)}
                  className="mt-3 text-[10px] text-slate-500 hover:text-cyan-300"
                >
                  ✕ close
                </button>
              </div>
            )}
          </>
        )}
        {error && !loading && (
          <p className="absolute inset-x-0 top-1/2 text-center text-xs text-slate-500">{error}</p>
        )}
      </div>

      {/* ---- Legend with hover explainers ---- */}
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] text-slate-500">
        {LEGEND.map((item) => (
          <span
            key={item.kind}
            className="bn-legend"
            onMouseEnter={() => setLegendOpen(item.kind)}
            onMouseLeave={() => setLegendOpen((k) => (k === item.kind ? null : k))}
          >
            <span className="cursor-help">
              <span className="bn-legend-dot" style={{ color: KIND_HEX[item.kind] }}>
                ●
              </span>{' '}
              {item.label}
            </span>
            {legendOpen === item.kind && (
              <span className="bn-legend-pop">
                <span className="bn-legend-pop-title" style={{ color: KIND_HEX[item.kind] }}>
                  {item.label}
                </span>
                <span className="bn-legend-pop-body">{item.blurb}</span>
              </span>
            )}
          </span>
        ))}
      </div>

      {/* ---- Organization tables + file/notes list + CLI ---- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Organization tables */}
        <section className="v0-panel p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Organization tables</p>
          <div className="mt-3 space-y-2">
            {tables.length === 0 && <p className="text-xs text-slate-500">No tables loaded.</p>}
            {tables.map((t) => (
              <div
                key={t.key}
                className="bn-row flex items-center justify-between rounded-lg border border-cyan-400/10 bg-black/30 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: KIND_HEX[(t.kind as GraphNode['kind']) || 'hub'] }}>●</span>
                  <div>
                    <p className="text-xs text-slate-200">{t.label}</p>
                    <p className="text-[10px] text-slate-500">{t.source}</p>
                  </div>
                </div>
                <span className="font-mono text-sm text-cyan-200">{t.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* File / notes list */}
        <section className="v0-panel p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Files &amp; notes</p>
          <div className="v0-scroll mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {memNodes.length === 0 && <p className="text-xs text-slate-500">No memories yet.</p>}
            {memNodes.slice(0, 40).map((n) => (
              <button
                key={n.id}
                onClick={() => flyTo(n.id)}
                className="bn-row flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left"
              >
                <span className="mt-0.5 text-[10px]" style={{ color: KIND_HEX[n.kind] }}>
                  ●
                </span>
                <span className="line-clamp-2 text-[11px] text-slate-300">{n.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* CLI console */}
        <div className="h-[calc(16rem+4.5rem)]">
          <BrainCli nodes={nodes} tables={tables} onFocus={flyTo} />
        </div>
      </div>

      {/* ---- Fullscreen overlay ---- */}
      {fullscreen && (
        <div className="bn-fullscreen">
          {scene}
          <button className="bn-exit" onClick={() => setFullscreen(false)}>
            ✕ Exit · Esc
          </button>
          {picked && (
            <div className="v0-rise absolute bottom-6 left-6 max-w-sm rounded-xl border border-cyan-400/30 bg-black/80 p-4 backdrop-blur">
              <p className="text-[10px] uppercase tracking-[0.3em]" style={{ color: KIND_HEX[picked.kind] }}>
                {picked.kind}
              </p>
              <p className="mt-1 text-sm text-slate-100">{picked.label}</p>
              {picked.at && (
                <p className="mt-2 font-mono text-[10px] text-slate-500">{new Date(picked.at).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
