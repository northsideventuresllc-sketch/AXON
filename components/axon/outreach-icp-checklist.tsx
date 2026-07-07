import type { OutreachTrainingSummary } from '@/lib/outreach-learn';

const STAGE_LABELS: Record<string, string> = {
  pre_scan: 'Pre-scan',
  scan_gate: 'Scan gate',
  post_scan: 'Post-scan',
  post_score: 'Low score',
  post_draft: 'Empty draft',
};

interface TodayQuery {
  query: string;
  industry: string;
  searchQuery: string;
}

interface OutreachIcpChecklistProps {
  minScore: number;
  todayQueries: TodayQuery[];
  training: OutreachTrainingSummary;
  icpAutoRejectedCount: number;
}

export function OutreachIcpChecklist({
  minScore,
  todayQueries,
  training,
  icpAutoRejectedCount,
}: OutreachIcpChecklistProps) {
  const stageEntries = Object.entries(training.icpDropStages || {}).sort((a, b) => b[1] - a[1]);
  const operatorPatterns = training.topRejectReasons.slice(0, 3);

  const items = [
    {
      label: 'Structured ICP segments & exclusions',
      detail: 'SMB + enterprise targets; job boards and recruiters excluded',
      done: true,
    },
    {
      label: "Today's rotating SERP queries",
      detail: todayQueries.map((q) => q.industry).join(' · ') || '—',
      done: todayQueries.length > 0,
    },
    {
      label: `Score gate ≥ ${minScore}`,
      detail: 'Low-score prospects dropped before queue',
      done: true,
    },
    {
      label: 'ICP drop telemetry',
      detail:
        training.icpDropCount > 0
          ? `${training.icpDropCount} drop${training.icpDropCount === 1 ? '' : 's'} logged`
          : 'No drops yet — run outreach to populate',
      done: training.icpDropCount > 0,
    },
    {
      label: 'Operator avoid patterns → pre-scan',
      detail:
        operatorPatterns.length > 0
          ? operatorPatterns.map(({ reason }) => reason).join('; ')
          : 'Reject with reasons in HQ to train filters',
      done: operatorPatterns.length > 0,
    },
  ];

  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-axon-gold">Track A · 5a</p>
          <h2 className="mt-1 text-lg font-medium">ICP Operator Checklist</h2>
          <p className="mt-1 max-w-2xl text-sm text-axon-muted">
            Nightly outreach runs the 8-step ICP pipeline. Manual runs: GitHub Actions → AXON NI
            Outreach → Run workflow → max <span className="font-mono">3</span>.
          </p>
        </div>
        {icpAutoRejectedCount > 0 && (
          <p className="text-xs text-axon-muted">
            <span className="font-mono text-axon-danger">{icpAutoRejectedCount}</span> queue sweep
            auto-reject{icpAutoRejectedCount === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex gap-3 rounded-lg border border-axon-border/60 bg-axon-elevated/30 px-4 py-3"
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                item.done
                  ? 'bg-axon-teal/20 text-axon-teal'
                  : 'border border-axon-border text-axon-muted'
              }`}
              aria-hidden
            >
              {item.done ? '✓' : '·'}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-axon-text">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-axon-muted">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {todayQueries.length > 0 && (
        <div className="mt-5 border-t border-axon-border/60 pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-axon-muted">
            Today&apos;s SERP queries
          </h3>
          <ul className="mt-2 space-y-2">
            {todayQueries.map((entry) => (
              <li key={entry.searchQuery} className="text-sm text-axon-muted">
                <span className="font-mono text-xs text-axon-gold">{entry.industry}</span>
                <span className="mx-2 opacity-40">·</span>
                {entry.query}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stageEntries.length > 0 && (
        <div className="mt-5 border-t border-axon-border/60 pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-axon-muted">
            ICP drops by stage
          </h3>
          <dl className="mt-2 flex flex-wrap gap-4">
            {stageEntries.map(([stage, count]) => (
              <div key={stage}>
                <dt className="text-xs text-axon-muted">{STAGE_LABELS[stage] || stage}</dt>
                <dd className="font-mono text-sm text-axon-text">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
