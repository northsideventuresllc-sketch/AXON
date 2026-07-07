'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { LeadWithMeta, PipelineStats } from '@/lib/types';
import type { OutreachTrainingSummary } from '@/lib/outreach-learn';
import { LeadCard, LeadRow } from './lead-card';
import { GoalProgress, PipelineBreakdown, StatsCards } from './stats-cards';
import { OutreachTrainingPanel } from './outreach-training-panel';
import { STATUS_ORDER } from '@/lib/types';
import { appPath } from '@/lib/paths';
import { consumeToolLaunch } from '@/lib/axon-user-tools';
import { useAxonToolDisplayNames } from '@/lib/use-axon-tool-display-names';
import { AxonToolLaunchOverlay } from './axon-tool-launch-overlay';

export type OutreachHqTab = 'overview' | 'queue' | 'pipeline';

const TABS: { id: OutreachHqTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'queue', label: 'Queue' },
  { id: 'pipeline', label: 'Pipeline' },
];

interface OutreachHqToolProps {
  stats: PipelineStats;
  leads: LeadWithMeta[];
  training: OutreachTrainingSummary;
  basePath?: string;
  initialTab?: OutreachHqTab;
  pipelineFilter?: string;
}

export function OutreachHqTool({
  stats,
  leads,
  training,
  basePath,
  initialTab = 'overview',
  pipelineFilter,
}: OutreachHqToolProps) {
  const { tools, getDisplayName } = useAxonToolDisplayNames();
  const outreach = tools.find((t) => t.slug === 'ni-outreach');
  const displayName = outreach ? getDisplayName(outreach) : 'NI Outreach HQ';
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as OutreachHqTab | null;
  const tab = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : initialTab;
  const pending = leads.filter((l) => l.status === 'pending_approval');
  const recent = leads.slice(0, 6);
  const filtered = pipelineFilter ? leads.filter((l) => l.status === pipelineFilter) : leads;

  const [showLaunch, setShowLaunch] = useState(false);

  useEffect(() => {
    if (consumeToolLaunch('ni-outreach')) setShowLaunch(true);
  }, []);

  const onLaunchComplete = useCallback(() => setShowLaunch(false), []);

  function tabHref(nextTab: OutreachHqTab): string {
    const base = basePath ? appPath('/tools/ni-outreach', basePath) : '/tools/ni-outreach';
    if (nextTab === 'overview') return base;
    return `${base}?tab=${nextTab}`;
  }

  function pipelineHref(status?: string): string {
    const base = tabHref('pipeline');
    return status ? `${base}&status=${status}` : base;
  }

  const homeHref = basePath ? appPath('/', basePath) : '/';

  return (
    <>
      {showLaunch && (
        <AxonToolLaunchOverlay toolName={displayName} icon="◎" onComplete={onLaunchComplete} />
      )}
      <div key={tab} className={`axon-tool-enter ${showLaunch ? 'axon-tool-enter--delayed' : ''}`}>
        <div className="space-y-8">
          <header>
            <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
              ← Back to AXON
            </Link>
            <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
            <h1 className="mt-1 text-3xl font-semibold">{displayName}</h1>
            <p className="mt-2 max-w-2xl text-sm text-axon-muted">
              Find → score → draft → approve → send. Queue and pipeline live inside this workspace.
            </p>
          </header>

          <nav className="flex flex-wrap gap-2 border-b border-axon-border/60 pb-3">
            {TABS.map((item) => (
              <Link
                key={item.id}
                href={tabHref(item.id)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                  tab === item.id
                    ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
                    : 'border-axon-border text-axon-muted hover:border-axon-gold/30 hover:text-axon-text'
                }`}
              >
                {item.label}
                {item.id === 'queue' && pending.length > 0 && (
                  <span className="ml-1.5 font-mono text-axon-teal">({pending.length})</span>
                )}
              </Link>
            ))}
          </nav>

          {tab === 'overview' && (
            <>
              <OutreachTrainingPanel summary={training} />
              <StatsCards stats={stats} />
              <div className="grid gap-6 lg:grid-cols-2">
                <GoalProgress stats={stats} />
                <PipelineBreakdown stats={stats} />
              </div>
              {pending.length > 0 && (
                <section>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-medium">
                      Pending Approval
                      <span className="ml-2 font-mono text-sm text-axon-gold">({pending.length})</span>
                    </h2>
                    <Link href={tabHref('queue')} className="text-sm text-axon-teal hover:underline">
                      View all →
                    </Link>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {pending.slice(0, 4).map((lead) => (
                      <LeadCard key={lead.id} lead={lead} basePath={basePath} />
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h2 className="mb-4 text-lg font-medium">Recent Activity</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {recent.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} basePath={basePath} />
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'queue' && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-medium">Approval Queue</h2>
                <p className="mt-1 text-sm text-axon-muted">
                  Review AI-drafted outreach. Approve to send (email) or mark for manual LinkedIn DM.
                </p>
              </div>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-axon-border p-12 text-center">
                  <p className="text-axon-muted">No drafts pending approval.</p>
                  <p className="mt-2 text-xs text-axon-muted">
                    Nightly outreach runs at 2:30 AM EST via GitHub Actions.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pending.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} basePath={basePath} />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'pipeline' && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-medium">Pipeline</h2>
                <p className="mt-1 text-sm text-axon-muted">All AXON NI Services leads from NI-Brain.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterPill href={pipelineHref()} label="All" active={!pipelineFilter} count={leads.length} />
                {STATUS_ORDER.map((status) => {
                  const count = leads.filter((l) => l.status === status).length;
                  if (count === 0) return null;
                  return (
                    <FilterPill
                      key={status}
                      href={pipelineHref(status)}
                      label={status.replace(/_/g, ' ')}
                      active={pipelineFilter === status}
                      count={count}
                    />
                  );
                })}
              </div>
              <div className="overflow-hidden rounded-xl border border-axon-border bg-axon-surface">
                <div className="grid grid-cols-[100px_1fr_120px_100px_100px] gap-4 border-b border-axon-border bg-axon-elevated px-4 py-2 text-xs uppercase tracking-wider text-axon-muted">
                  <span>ID</span>
                  <span>Company</span>
                  <span>Channel</span>
                  <span>Score</span>
                  <span>Status</span>
                </div>
                {filtered.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-axon-muted">No leads match this filter.</p>
                ) : (
                  filtered.map((lead) => <LeadRow key={lead.id} lead={lead} basePath={basePath} />)
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function FilterPill({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
        active
          ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
          : 'border-axon-border text-axon-muted hover:border-axon-gold/30'
      }`}
    >
      {label} ({count})
    </Link>
  );
}
