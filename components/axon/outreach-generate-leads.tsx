'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PipelineStats } from '@/lib/types';
import { apiUrl } from '@/lib/api-base';

interface RunStatus {
  configured: boolean;
  run: {
    status: string;
    conclusion: string | null;
    htmlUrl: string;
    createdAt: string;
    event: string;
  } | null;
}

export function OutreachGenerateLeads({ stats }: { stats: PipelineStats }) {
  const router = useRouter();
  const [max, setMax] = useState(3);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionsUrl, setActionsUrl] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);

  const remaining = Math.max(0, stats.draftsCap - stats.draftsToday);
  const atCap = remaining <= 0;

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/axon/outreach/run'));
      const data = await res.json();
      if (res.ok) setRunStatus(data);
    } catch {
      /* status is optional */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function generate() {
    setLoading(true);
    setMessage(null);
    setError(null);
    setActionsUrl(null);
    try {
      const res = await fetch(apiUrl('/api/axon/outreach/run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max: Math.min(max, remaining || max) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start outreach run');
      setMessage(data.message);
      setActionsUrl(data.actionsUrl ?? null);
      await loadStatus();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start outreach run');
    } finally {
      setLoading(false);
    }
  }

  const lastRun = runStatus?.run;
  const runInProgress = lastRun?.status === 'in_progress' || lastRun?.status === 'queued';

  return (
    <section className="rounded-xl border border-axon-teal/30 bg-axon-teal/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-axon-teal">Generate leads</p>
          <h2 className="mt-1 text-lg font-medium">Run outreach now</h2>
          <p className="mt-1 max-w-xl text-sm text-axon-muted">
            Trigger the 8-step ICP pipeline — find, score, draft, queue. Telegram notifies when
            drafts are ready. Nightly cron is off right now — run this daily until JB re-enables it.
          </p>
        </div>
        <dl className="flex gap-4 text-xs">
          <div>
            <dt className="text-axon-muted">Drafts today</dt>
            <dd className="font-mono text-axon-text">
              {stats.draftsToday}/{stats.draftsCap}
            </dd>
          </div>
          <div>
            <dt className="text-axon-muted">Remaining</dt>
            <dd className="font-mono text-axon-teal">{remaining}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="block space-y-1.5">
          <span className="text-xs text-axon-muted">Max drafts this run</span>
          <input
            type="number"
            min={1}
            max={Math.min(15, remaining || 15)}
            value={max}
            disabled={loading || atCap}
            onChange={(e) => setMax(Number(e.target.value) || 3)}
            className="w-24 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 font-mono text-sm text-axon-text"
          />
        </label>
        <button
          type="button"
          disabled={loading || atCap || runInProgress}
          onClick={generate}
          className="rounded-lg border border-axon-teal/50 bg-axon-teal/15 px-5 py-2 text-sm font-medium text-axon-teal transition hover:bg-axon-teal/25 disabled:opacity-50"
        >
          {loading ? 'Starting…' : runInProgress ? 'Run in progress…' : 'Generate leads'}
        </button>
      </div>

      {atCap && (
        <p className="mt-3 text-sm text-axon-muted">
          Daily draft cap reached ({stats.draftsCap}). Try again tomorrow or raise{' '}
          <span className="font-mono">MAX_DRAFTS_PER_DAY</span>.
        </p>
      )}

      {runStatus && !runStatus.configured && (
        <p className="mt-3 text-sm text-axon-muted">
          GitHub dispatch not configured — set <span className="font-mono">AXON_GITHUB_PAT</span>{' '}
          on Vercel (actions:write on AXON repo).
        </p>
      )}

      {lastRun && (
        <p className="mt-3 text-xs text-axon-muted">
          Last run:{' '}
          <a
            href={lastRun.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-axon-teal hover:underline"
          >
            {lastRun.status}
            {lastRun.conclusion ? ` · ${lastRun.conclusion}` : ''}
          </a>
          {' · '}
          {new Date(lastRun.createdAt).toLocaleString()}
        </p>
      )}

      {message && (
        <p className="mt-3 rounded-lg border border-axon-teal/30 bg-axon-elevated/50 px-4 py-3 text-sm text-axon-text">
          {message}
          {actionsUrl && (
            <>
              {' '}
              <a
                href={actionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-axon-teal hover:underline"
              >
                View in GitHub Actions →
              </a>
            </>
          )}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-axon-danger/30 bg-axon-danger/5 px-4 py-3 text-sm text-axon-danger">
          {error}
        </p>
      )}
    </section>
  );
}
