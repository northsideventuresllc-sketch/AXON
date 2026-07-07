import type { OutreachTrainingSummary } from '@/lib/outreach-learn';

const FIELD_LABELS: Record<string, string> = {
  email_subject: 'Subject lines',
  comment_draft: 'Email body',
  dm_draft: 'LinkedIn DM',
};

export function OutreachTrainingPanel({ summary }: { summary: OutreachTrainingSummary }) {
  const bodyEdits =
    (summary.editFieldCounts.comment_draft || 0) + (summary.editFieldCounts.dm_draft || 0);

  return (
    <section className="rounded-xl border border-axon-gold/20 bg-axon-gold/5 p-5 axon-glass">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-axon-gold/40 bg-axon-gold/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-axon-gold">
              Training mode
            </span>
            <span className="text-xs text-axon-muted">Always on</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-axon-text">
            Your draft edits, reject reasons, and approvals shape the next nightly outreach run.
            {summary.active
              ? ` ${summary.signalCount} training signal${summary.signalCount === 1 ? '' : 's'} captured.`
              : ' Edit a draft or reject with a reason to start training AXON.'}
          </p>
        </div>
        {summary.approvals.total > 0 && (
          <dl className="flex gap-4 text-xs">
            <div>
              <dt className="text-axon-muted">Approved</dt>
              <dd className="font-mono text-axon-teal">{summary.approvals.total}</dd>
            </div>
            <div>
              <dt className="text-axon-muted">Unchanged</dt>
              <dd className="font-mono text-axon-text">{summary.approvals.unchanged}</dd>
            </div>
          </dl>
        )}
      </div>

      {summary.active && (
        <div className="mt-4 grid gap-4 border-t border-axon-gold/10 pt-4 lg:grid-cols-2">
          {summary.topRejectReasons.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-axon-muted">
                Avoid patterns
              </h3>
              <ul className="mt-2 space-y-1.5">
                {summary.topRejectReasons.slice(0, 5).map(({ reason, count }) => (
                  <li
                    key={reason}
                    className="flex items-start justify-between gap-3 text-sm text-axon-text"
                  >
                    <span className="leading-snug">{reason}</span>
                    <span className="shrink-0 font-mono text-xs text-axon-muted">×{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Object.keys(summary.editFieldCounts).length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-axon-muted">
                Edit focus
              </h3>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(summary.editFieldCounts).map(([field, count]) => (
                  <li key={field} className="flex justify-between gap-3 text-sm text-axon-text">
                    <span>{FIELD_LABELS[field] || field.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-xs text-axon-muted">×{count}</span>
                  </li>
                ))}
              </ul>
              {bodyEdits >= 2 && (
                <p className="mt-2 text-xs text-axon-muted">
                  AXON will tighten copy and personalize pain points on the next run.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
