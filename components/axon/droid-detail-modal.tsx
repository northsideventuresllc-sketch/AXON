'use client';

import { useEffect } from 'react';
import type { AxonCronJobView } from '@/lib/axon-cron-jobs';
import { DroidScene } from './droid-scene';

type DroidDetailModalProps = {
  job: AxonCronJobView;
  onClose: () => void;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function DroidDetailModal({ job, onClose }: DroidDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="axon-droid-modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="droid-modal-title"
      onClick={onClose}
    >
      <div
        className="axon-droid-modal-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-axon-border bg-axon-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-axon-blue-glow">Droid Space</p>
            <h2 id="droid-modal-title" className="mt-1 text-xl font-semibold text-white">
              {job.title}
            </h2>
            <p className="text-xs text-axon-muted">{job.droidRole} · {job.scheduleLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-axon-border px-3 py-1 text-sm text-axon-muted hover:text-white"
          >
            Close
          </button>
        </div>

        <DroidScene jobs={[job]} variant="expanded" />

        <div className="mt-4 space-y-4 text-sm">
          <Section title="AXON tools used">
            <div className="flex flex-wrap gap-2">
              {job.axonTools.map((t) => (
                <span key={t} className="rounded-full bg-axon-blue-glow/10 px-2 py-0.5 text-xs text-axon-cyan">
                  {t}
                </span>
              ))}
            </div>
          </Section>
          <Section title="What it does">{job.description}</Section>
          <Section title="How it works">{job.howItWorks}</Section>
          <Section title="Why it matters">{job.whyImportant}</Section>
          <Section title="Results">
            <p>
              <span className="text-axon-muted">Last run:</span> {formatWhen(job.lastRunAt)}
              {job.lastRunStatus && (
                <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-xs">{job.lastRunStatus}</span>
              )}
            </p>
            {job.lastRunSummary && <p className="mt-1 text-axon-muted">{job.lastRunSummary}</p>}
            <p className="mt-2">
              <span className="text-axon-muted">Next run:</span> {formatWhen(job.nextRunAt)}
            </p>
          </Section>
          {job.warnings.length > 0 && (
            <Section title="Warnings">
              <ul className="list-disc space-y-1 pl-4 text-amber-200/90">
                {job.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wider text-axon-gold">{title}</h3>
      <div className="mt-1 text-axon-muted leading-relaxed">{children}</div>
    </div>
  );
}
