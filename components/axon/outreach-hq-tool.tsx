'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { LeadWithMeta, PipelineStats } from '@/lib/types';
import type { OutreachTrainingSummary } from '@/lib/outreach-learn';
import { LeadCard, LeadRow } from './lead-card';
import { GoalProgress, PipelineBreakdown, StatsCards } from './stats-cards';
import { OutreachTrainingPanel } from './outreach-training-panel';
import { OutreachIcpChecklist } from './outreach-icp-checklist';
import { OutreachGenerateLeads } from './outreach-generate-leads';
import { OutreachChannelSettings } from './outreach-channel-settings';
import { STATUS_ORDER, BULK_STATUS_OPTIONS } from '@/lib/types';
import { apiUrl } from '@/lib/api-base';
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
  todayQueries: Array<{ query: string; industry: string; searchQuery: string }>;
  minScore: number;
  basePath?: string;
  initialTab?: OutreachHqTab;
  pipelineFilter?: string;
}

export function OutreachHqTool({
  stats,
  leads,
  training,
  todayQueries,
  minScore,
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
  const filtered = pipelineFilter
    ? pipelineFilter === 'icp_auto'
      ? leads.filter((l) => l.meta.auto_rejected === 'icp_violation')
      : leads.filter((l) => l.status === pipelineFilter)
    : leads;
  const icpAutoRejectedCount = leads.filter((l) => l.meta.auto_rejected === 'icp_violation').length;

  const [showLaunch, setShowLaunch] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState('approved');

  useEffect(() => {
    if (consumeToolLaunch('ni-outreach')) setShowLaunch(true);
  }, []);

  const onLaunchComplete = useCallback(() => setShowLaunch(false), []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  }

  async function runBulk(action: 'archive' | 'status') {
    if (!selectedIds.size) return;
    setBulkLoading(true);
    setBulkMessage(null);
    try {
      const res = await fetch(apiUrl('/api/leads/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [...selectedIds],
          action,
          status: action === 'status' ? bulkStatus : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk action failed');
      setBulkMessage(data.message);
      setSelectedIds(new Set());
      setSelectMode(false);
      window.location.reload();
    } catch (err) {
      setBulkMessage(err instanceof Error ? err.message : 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  }

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
              <OutreachGenerateLeads stats={stats} />
              <OutreachChannelSettings />
              <OutreachIcpChecklist
                minScore={minScore}
                todayQueries={todayQueries}
                training={training}
                icpAutoRejectedCount={icpAutoRejectedCount}
              />
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
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-medium">Pipeline</h2>
                  <p className="mt-1 text-sm text-axon-muted">All AXON NI Services leads from NI-Brain.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode((v) => !v);
                    setSelectedIds(new Set());
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    selectMode
                      ? 'border-axon-gold/50 bg-axon-gold/10 text-axon-gold'
                      : 'border-axon-border text-axon-muted hover:border-axon-gold/30'
                  }`}
                >
                  {selectMode ? 'Cancel Select' : 'Select'}
                </button>
              </div>

              {selectMode && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-axon-gold/30 bg-axon-gold/5 p-4">
                  <span className="text-sm text-axon-muted">{selectedIds.size} selected</span>
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    className="text-sm text-axon-teal hover:underline"
                  >
                    {selectedIds.size === filtered.length ? 'Deselect all' : 'Select all visible'}
                  </button>
                  <select
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    className="rounded-lg border border-axon-border bg-axon-elevated px-3 py-1.5 text-sm"
                  >
                    {BULK_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!selectedIds.size || bulkLoading}
                    onClick={() => runBulk('status')}
                    className="rounded-lg border border-axon-border px-3 py-1.5 text-sm hover:bg-axon-elevated disabled:opacity-50"
                  >
                    Mass change status
                  </button>
                  <button
                    type="button"
                    disabled={!selectedIds.size || bulkLoading}
                    onClick={() => runBulk('archive')}
                    className="rounded-lg border border-axon-border px-3 py-1.5 text-sm hover:bg-axon-elevated disabled:opacity-50"
                  >
                    Mass archive
                  </button>
                  {bulkMessage && <span className="text-sm text-axon-muted">{bulkMessage}</span>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <FilterPill href={pipelineHref()} label="All" active={!pipelineFilter} count={leads.length} />
                {icpAutoRejectedCount > 0 && (
                  <FilterPill
                    href={pipelineHref('icp_auto')}
                    label="ICP auto-rejected"
                    active={pipelineFilter === 'icp_auto'}
                    count={icpAutoRejectedCount}
                  />
                )}
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
                <div
                  className={`grid gap-4 border-b border-axon-border bg-axon-elevated px-4 py-2 text-xs uppercase tracking-wider text-axon-muted ${
                    selectMode ? 'grid-cols-[40px_100px_1fr_120px_100px_100px]' : 'grid-cols-[100px_1fr_120px_100px_100px]'
                  }`}
                >
                  {selectMode && <span />}
                  <span>ID</span>
                  <span>Company</span>
                  <span>Channel</span>
                  <span>Score</span>
                  <span>Status</span>
                </div>
                {filtered.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-axon-muted">No leads match this filter.</p>
                ) : (
                  filtered.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      basePath={basePath}
                      selectable={selectMode}
                      selected={selectedIds.has(lead.id)}
                      onToggleSelect={() => toggleSelect(lead.id)}
                    />
                  ))
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
