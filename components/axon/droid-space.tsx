'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import type { AxonCronJobView } from '@/lib/axon-cron-jobs';
import { DroidScene } from './droid-scene';
import { DroidDetailModal } from './droid-detail-modal';

export function DroidSpace() {
  const [jobs, setJobs] = useState<AxonCronJobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AxonCronJobView | null>(null);

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
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const scheduled = jobs.filter((j) => j.scheduled);

  return (
    <section className="axon-card-3d rounded-2xl border border-axon-border/50 bg-axon-surface/70 axon-glass backdrop-blur-sm">
      <div className="border-b border-axon-border/60 px-4 py-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-axon-blue-glow">Droid Space</h2>
        <p className="mt-0.5 text-xs text-axon-muted">
          OpenClaw-style worker bay — cron droids work when scheduled jobs run; bunk when idle
        </p>
      </div>

      <div className="space-y-4 p-4">
        {loading && <p className="text-sm text-axon-muted">Loading droid bay…</p>}
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            {scheduled.length > 0 ? (
              <DroidScene jobs={jobs} variant="compact" />
            ) : (
              <DroidScene jobs={[]} variant="compact" />
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelected(job)}
                  className={`group rounded-lg border p-3 text-left transition ${
                    job.scheduled
                      ? 'border-axon-border/50 hover:border-axon-blue-glow/40 hover:bg-axon-elevated/40'
                      : 'border-axon-border/30 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-axon-muted">
                      {job.droidRole}
                    </span>
                    <StatusDot running={job.running} scheduled={job.scheduled} enabled={job.enabled} />
                  </div>
                  <h3 className="mt-1 text-sm font-medium text-white group-hover:text-axon-cyan">
                    {job.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs text-axon-muted">{job.description}</p>
                  {job.scheduled && (
                    <p className="mt-2 font-mono text-[10px] text-axon-teal">
                      {job.running ? 'Working now' : job.enabled ? 'Scheduled' : 'Paused'}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {selected && <DroidDetailModal job={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function StatusDot({
  running,
  scheduled,
  enabled,
}: {
  running: boolean;
  scheduled: boolean;
  enabled: boolean;
}) {
  const color = running
    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
    : scheduled && enabled
      ? 'bg-axon-blue-glow'
      : 'bg-axon-muted/50';
  return <span className={`h-2 w-2 rounded-full ${color}`} />;
}
