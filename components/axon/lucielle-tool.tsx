'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { appPath } from '@/lib/paths';
import {
  LUCIELLE_CONNECTORS,
  LUCIELLE_HIERARCHY,
  LUCIELLE_VIEWS,
  type LucielleMetric,
  type LucielleMode,
  type LucielleNode,
} from '@/lib/axon-tools-data';
import { AxonToolFooter } from './axon-tool-footer';

function formatMetric(m: LucielleMetric): string {
  if (m.format === 'percent') return `${m.value}%`;
  return `$${m.value.toLocaleString('en-US')}`;
}

export function LucielleTool({ basePath }: { basePath?: string }) {
  const [mode, setMode] = useState<LucielleMode>('nvg');
  const [selectedNode, setSelectedNode] = useState<string>('nvg');
  const homeHref = basePath ? appPath('/', basePath) : '/';

  const view = useMemo(() => {
    if (mode === 'personal') return LUCIELLE_VIEWS.personal;
    return LUCIELLE_VIEWS.nvg;
  }, [mode]);

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
        <h1 className="mt-1 text-3xl font-semibold">Lucielle</h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Financial command center across the NORTHSiDE portfolio. Roll up revenue, profit and cash
          by venture, then drill into sectors.
        </p>
      </header>

      <div className="inline-flex rounded-lg border border-axon-border bg-axon-surface p-1">
        {(['nvg', 'personal'] as LucielleMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setSelectedNode(m === 'nvg' ? 'nvg' : 'personal');
            }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              mode === m ? 'bg-axon-blue/20 text-axon-cyan' : 'text-axon-muted hover:text-axon-text'
            }`}
          >
            {m === 'nvg' ? 'NVG (Business)' : 'Personal'}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {mode === 'nvg' ? (
          <aside className="rounded-xl border border-axon-border bg-axon-surface p-4">
            <p className="mb-3 text-xs uppercase tracking-wider text-axon-muted">Hierarchy</p>
            <HierarchyTree
              node={LUCIELLE_HIERARCHY}
              selected={selectedNode}
              onSelect={setSelectedNode}
              depth={0}
            />
          </aside>
        ) : (
          <aside className="rounded-xl border border-axon-border bg-axon-surface p-4">
            <p className="mb-3 text-xs uppercase tracking-wider text-axon-muted">Scope</p>
            <p className="text-sm text-axon-text">JB — Personal</p>
            <p className="mt-1 text-xs text-axon-muted">
              Personal income, savings and cash separate from the venture group.
            </p>
          </aside>
        )}

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {view.metrics.map((m) => (
              <div key={m.key} className="rounded-xl border border-axon-border bg-axon-surface p-4">
                <p className="text-xs text-axon-muted">{m.label}</p>
                <p className="mt-1 text-xl font-semibold text-axon-text">{formatMetric(m)}</p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    m.deltaPct >= 0 ? 'text-axon-success' : 'text-axon-danger'
                  }`}
                >
                  {m.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(m.deltaPct)}%
                </p>
              </div>
            ))}
          </div>

          <section>
            <h2 className="mb-3 text-lg font-medium">Recommendations</h2>
            <div className="space-y-2">
              {view.recommendations.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-xl border border-axon-border bg-axon-surface p-4"
                >
                  <span
                    className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      r.severity === 'action'
                        ? 'bg-axon-teal/15 text-axon-teal'
                        : r.severity === 'watch'
                          ? 'bg-axon-gold/15 text-axon-gold'
                          : 'bg-axon-blue/15 text-axon-cyan'
                    }`}
                  >
                    {r.severity}
                  </span>
                  <p className="text-sm text-axon-text">{r.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Connectors</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LUCIELLE_CONNECTORS.map((c) => (
            <div key={c.id} className="rounded-xl border border-dashed border-axon-border bg-axon-surface/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-axon-text">{c.label}</span>
                <span className="rounded-full bg-axon-elevated px-2 py-0.5 text-[10px] uppercase tracking-wide text-axon-muted">
                  {c.status}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-axon-muted">{c.note}</p>
              <button
                type="button"
                disabled
                className="mt-3 cursor-not-allowed rounded-lg border border-axon-border px-3 py-1.5 text-xs text-axon-muted opacity-70"
              >
                Connect (placeholder)
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-axon-blue/25 bg-axon-blue/5 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-axon-cyan">Learning note</p>
        <p className="mt-2 text-sm text-axon-muted">
          Lucielle learns your portfolio over time — as connectors come online it will benchmark
          venture margins, flag cash-timing risks, and tune recommendations to how you actually run
          NORTHSiDE. Today&apos;s figures are representative until banks, Stripe, P2P and credit
          feeds are linked.
        </p>
      </section>

      <AxonToolFooter toolSlug="lucielle" basePath={basePath} />
    </div>
  );
}

function HierarchyTree({
  node,
  selected,
  onSelect,
  depth,
}: {
  node: LucielleNode;
  selected: string;
  onSelect: (id: string) => void;
  depth: number;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
          selected === node.id
            ? 'bg-axon-blue/15 text-axon-cyan'
            : 'text-axon-muted hover:bg-axon-elevated/50 hover:text-axon-text'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="text-[10px] opacity-60">
          {node.kind === 'group' ? '◆' : node.kind === 'company' ? '▸' : '·'}
        </span>
        {node.label}
      </button>
      {node.children?.map((child) => (
        <HierarchyTree
          key={child.id}
          node={child}
          selected={selected}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
