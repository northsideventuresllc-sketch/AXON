import { Suspense } from 'react';
import { OutreachHqTool } from '@/components/axon-ui/outreach-hq-tool';
import { fetchLeads, fetchPipelineStats } from '@/lib/axon/leads';
import { getOutreachTrainingSummary } from '@/lib/axon/outreach-learn';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonNiOutreachPage({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { tab?: string; status?: string };
}) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);
  const { tab, status } = searchParams;
  const [stats, leads, training] = await Promise.all([
    fetchPipelineStats(),
    fetchLeads(500),
    getOutreachTrainingSummary(),
  ]);
  const initialTab =
    tab === 'queue' || tab === 'pipeline' || tab === 'overview' ? tab : 'overview';

  return (
    <Suspense fallback={<div className="text-sm text-axon-muted">Loading NI Outreach HQ…</div>}>
      <OutreachHqTool
        stats={stats}
        leads={leads}
        training={training}
        basePath={basePath}
        initialTab={initialTab}
        pipelineFilter={tab === 'pipeline' ? status : undefined}
      />
    </Suspense>
  );
}
