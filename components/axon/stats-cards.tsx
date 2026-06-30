import type { PipelineStats } from '@/lib/types';

export function StatsCards({ stats }: { stats: PipelineStats }) {
  const cards = [
    { label: 'Total Leads', value: stats.total, sub: 'All time pipeline' },
    { label: 'Pending Approval', value: stats.pending, sub: 'Awaiting JB review', accent: true },
    { label: 'Sent', value: stats.sent, sub: 'Outreach delivered' },
    { label: 'Closed Won', value: `${stats.closedWon}/${stats.goalTarget}`, sub: 'Phase 1 goal' },
    { label: 'Drafts Today', value: `${stats.draftsToday}/${stats.draftsCap}`, sub: 'Daily cap' },
    { label: 'Rejected', value: stats.dead, sub: 'Killed leads' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border border-axon-border bg-axon-surface p-5 ${
            card.accent ? 'axon-glow border-axon-gold/30' : ''
          }`}
        >
          <p className="text-xs uppercase tracking-wider text-axon-muted">{card.label}</p>
          <p className={`mt-2 text-3xl font-semibold ${card.accent ? 'text-axon-gold' : ''}`}>
            {card.value}
          </p>
          <p className="mt-1 text-xs text-axon-muted">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}

export function GoalProgress({ stats }: { stats: PipelineStats }) {
  const pct = Math.min(100, Math.round((stats.closedWon / stats.goalTarget) * 100));

  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface p-6">
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-sm font-medium text-axon-text">Phase 1 Goal</h3>
          <p className="mt-1 text-xs text-axon-muted">Close 4 paid NI Services clients</p>
        </div>
        <span className="font-mono text-2xl font-semibold text-axon-gold">
          {stats.closedWon}/{stats.goalTarget}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-axon-elevated">
        <div
          className="h-full rounded-full bg-gradient-to-r from-axon-gold-dim to-axon-gold transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-axon-muted">{pct}% complete</p>
    </div>
  );
}

export function PipelineBreakdown({ stats }: { stats: PipelineStats }) {
  const entries = Object.entries(stats.counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface p-6">
      <h3 className="text-sm font-medium">Status Breakdown</h3>
      <div className="mt-4 space-y-3">
        {entries.map(([status, count]) => (
          <div key={status} className="flex items-center justify-between text-sm">
            <span className="text-axon-muted">{status.replace(/_/g, ' ')}</span>
            <span className="font-mono text-axon-text">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
