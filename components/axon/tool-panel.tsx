'use client';

import Link from 'next/link';
import type { AxonTool } from '@/lib/axon-types';

interface ToolPanelProps {
  tools: AxonTool[];
  metrics?: Record<string, string | number>;
}

export function ToolPanel({ tools, metrics = {} }: ToolPanelProps) {
  return (
    <section className="axon-card-3d rounded-2xl border border-axon-border/50 bg-axon-surface/70 axon-glass backdrop-blur-sm">
      <div className="border-b border-axon-border/60 px-4 py-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-axon-purple-glow">Autonomous Tasks</h2>
        <p className="mt-0.5 text-xs text-axon-muted">Each engine runs independently — tap to open</p>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {tools.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} metric={metrics[tool.slug]} />
        ))}
      </div>
    </section>
  );
}

function ToolCard({ tool, metric }: { tool: AxonTool; metric?: string | number }) {
  const disabled = tool.status !== 'active';

  const inner = (
    <div
      className={`group rounded-lg border p-4 transition ${
        disabled
          ? 'border-axon-border/50 opacity-60'
          : 'border-axon-border/50 hover:border-axon-purple-glow/40 hover:bg-axon-elevated/50 cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg opacity-70">{tool.icon}</span>
        <StatusPill status={tool.status} />
      </div>
      <h3 className="mt-2 text-sm font-medium group-hover:text-axon-purple-glow">{tool.name}</h3>
      <p className="mt-1 line-clamp-2 text-xs text-axon-muted">{tool.description}</p>
      {metric != null && tool.status === 'active' && (
        <p className="mt-2 font-mono text-xs text-axon-teal">{metric} pending</p>
      )}
      {tool.phase && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-axon-muted">Phase {tool.phase}</p>
      )}
    </div>
  );

  if (disabled) return inner;
  return <Link href={tool.href}>{inner}</Link>;
}

function StatusPill({ status }: { status: AxonTool['status'] }) {
  const styles = {
    active: 'bg-axon-success/15 text-axon-success',
    building: 'bg-axon-gold/15 text-axon-gold',
    planned: 'bg-axon-muted/15 text-axon-muted',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}
