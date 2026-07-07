import { Suspense } from 'react';
import { fetchLeads, fetchPipelineStats } from '@/lib/leads';
import { getOutreachTrainingSummary, getOutreachIcpChecklistMeta } from '@/lib/outreach-learn';
import { OutreachHqTool } from '@/components/axon/outreach-hq-tool';

export const dynamic = 'force-dynamic';

export default async function NiOutreachToolPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const { tab, status } = await searchParams;
  const [stats, leads, training] = await Promise.all([
    fetchPipelineStats(),
    fetchLeads(500),
    getOutreachTrainingSummary(),
  ]);
  const { minScore, todayQueries } = getOutreachIcpChecklistMeta();
  const initialTab =
    tab === 'queue' || tab === 'pipeline' || tab === 'overview' ? tab : 'overview';

  return (
    <Suspense fallback={<div className="text-sm text-axon-muted">Loading NI Outreach HQ…</div>}>
      <OutreachHqTool
        stats={stats}
        leads={leads}
        training={training}
        todayQueries={todayQueries}
        minScore={minScore}
        initialTab={initialTab}
        pipelineFilter={tab === 'pipeline' ? status : undefined}
      />
    </Suspense>
  );
}
