'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import type { AxonCronJobView } from '@/lib/axon-cron-jobs';

export function CronJobsPanel() {
  const [jobs, setJobs] = useState<AxonCronJobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(apiUrl('/api/axon/cron/jobs'));
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'load failed');
      setJobs(data.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  async function toggleJob(job: AxonCronJobView) {
    setToggling(job.id);
    setMessage(null);
    setError(null);
    try {
      const r = await fetch(apiUrl(`/api/axon/cron/jobs/${encodeURIComponent(job.id)}/toggle`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'toggle failed');
      setMessage(`${job.title} ${data.job.enabled ? 'started' : 'stopped'}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'toggle failed');
    } finally {
      setToggling(null);
    }
  }

  if (loading) return <p className="text-sm text-axon-muted">Loading cron jobs…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-axon-muted">
        Repeating GitHub Actions workflows — previous run, next run, warnings, and start/stop controls.
      </p>
      {message && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <article
            key={job.id}
            className="overflow-hidden rounded-xl border border-white/10 bg-axon-elevated/30"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
              <div>
                <h3 className="font-medium text-white">{job.title}</h3>
                <p className="text-xs text-axon-muted">{job.scheduleLabel}</p>
                <p className="mt-1 text-xs text-axon-teal">{job.workflowRepo} · {job.workflowFile}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                  className="rounded-lg border border-axon-border px-3 py-1.5 text-xs text-axon-muted hover:text-white"
                >
                  {expanded === job.id ? 'Hide details' : 'What it does'}
                </button>
                <button
                  type="button"
                  disabled={toggling === job.id || !job.cronUtc}
                  onClick={() => toggleJob(job)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    job.enabled
                      ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
                      : 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {toggling === job.id ? '…' : job.enabled ? 'Stop' : 'Start'}
                </button>
              </div>
            </div>

            <div className="grid gap-3 px-4 py-3 sm:grid-cols-3 text-sm">
              <Metric label="Previous run" value={formatWhen(job.lastRunAt)} />
              <Metric
                label="Status"
                value={job.running ? 'Running' : job.lastRunStatus ?? '—'}
                highlight={job.running}
              />
              <Metric label="Next run" value={job.scheduled ? formatWhen(job.nextRunAt) : 'Not scheduled'} />
            </div>

            {job.lastRunSummary && (
              <p className="border-t border-white/5 px-4 py-2 text-xs text-axon-muted">
                Result: {job.lastRunSummary}
              </p>
            )}

            {job.warnings.length > 0 && (
              <ul className="border-t border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-200/90">
                {job.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}

            {expanded === job.id && (
              <div className="space-y-2 border-t border-white/5 px-4 py-3 text-xs text-axon-muted">
                <p><strong className="text-white">Description:</strong> {job.description}</p>
                <p><strong className="text-white">How:</strong> {job.howItWorks}</p>
                <p><strong className="text-white">Why:</strong> {job.whyImportant}</p>
                <p>
                  <strong className="text-white">Tools:</strong> {job.axonTools.join(' · ')}
                </p>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-axon-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-xs ${highlight ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
