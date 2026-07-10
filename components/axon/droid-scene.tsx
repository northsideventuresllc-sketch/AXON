'use client';

import type { AxonCronJobView } from '@/lib/axon-cron-jobs';
import { AxonDroidAvatar } from './axon-droid-avatar';

type DroidSceneProps = {
  jobs: AxonCronJobView[];
  variant?: 'compact' | 'expanded';
};

export function DroidScene({ jobs, variant = 'compact' }: DroidSceneProps) {
  const scheduled = jobs.filter((j) => j.scheduled);
  const anyRunning = scheduled.some((j) => j.running);
  const sleeping = !anyRunning;
  const h = variant === 'expanded' ? 'min-h-[220px]' : 'min-h-[120px]';

  if (!scheduled.length) {
    return (
      <div className={`axon-droid-bunk ${h} flex items-center justify-center rounded-xl border border-axon-border/40 bg-axon-elevated/30 px-4`}>
        <p className="text-center text-xs text-axon-muted">
          No scheduled cron jobs enabled — Droid Space is quiet until you turn on a repeating workflow.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`axon-droid-scene ${sleeping ? 'axon-droid-scene--sleep' : 'axon-droid-scene--work'} ${h} relative overflow-hidden rounded-xl border border-axon-border/50`}
      data-variant={variant}
    >
      <div className="axon-droid-scene-grid" aria-hidden />
      {sleeping ? (
        <div className="axon-droid-bunk-row flex h-full items-end justify-center gap-3 px-3 pb-4 pt-6">
          {scheduled.map((job, i) => (
            <div key={job.id} className="axon-droid-bunk-slot flex flex-col items-center" style={{ animationDelay: `${i * 0.2}s` }}>
              <AxonDroidAvatar faceShape={job.faceShape} role={job.droidRole} active={false} sleeping size={variant === 'expanded' ? 'lg' : 'sm'} />
            </div>
          ))}
        </div>
      ) : (
        <div className="axon-droid-work-floor relative h-full px-2 py-3">
          {scheduled.map((job, i) => (
            <div
              key={job.id}
              className="axon-droid-patrol absolute"
              style={{
                left: `${8 + (i * 72) % (variant === 'expanded' ? 280 : 180)}px`,
                top: `${20 + (i % 2) * (variant === 'expanded' ? 48 : 28)}px`,
                animationDelay: `${i * 0.35}s`,
              }}
            >
              <AxonDroidAvatar
                faceShape={job.faceShape}
                role={job.droidRole}
                active={job.running}
                size={variant === 'expanded' ? 'lg' : 'md'}
              />
            </div>
          ))}
        </div>
      )}
      <div className="absolute bottom-1 right-2 text-[10px] uppercase tracking-wider text-axon-muted/80">
        {sleeping ? 'Bunk room · lights out' : 'Floor active · droids on task'}
      </div>
    </div>
  );
}
