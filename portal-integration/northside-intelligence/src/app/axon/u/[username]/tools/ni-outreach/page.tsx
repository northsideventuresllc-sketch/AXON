import { Suspense } from 'react';
import { OutreachHqTool } from '@/components/axon-ui/outreach-hq-tool';
import { fetchLeads, fetchPipelineStats, getClient, enrichLead } from '@/lib/axon/leads';
import { getOutreachTrainingSummary, getOutreachIcpChecklistMeta } from '@/lib/axon/outreach-learn';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';
import { SOURCE } from '@/lib/axon/constants.mjs';
import type { Lead } from '@/lib/axon/types';

export const dynamic = 'force-dynamic';

async function fetchSentLeads() {
  const { sbSelect } = getClient();
  const rows = (await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&status=eq.sent&select=*&order=created_at.desc&limit=200`,
  )) as Lead[];
  const leads = (rows || []).map(enrichLead);
  return {
    pending: leads.filter((l) => !l.meta.follow_up_sent_at),
    done: leads.filter((l) => !!l.meta.follow_up_sent_at),
  };
}

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
  const [stats, leads, training, followUp] = await Promise.all([
    fetchPipelineStats(),
    fetchLeads(500),
    getOutreachTrainingSummary(),
    fetchSentLeads(),
  ]);
  const initialTab =
    tab === 'queue' || tab === 'pipeline' || tab === 'follow-up' || tab === 'overview'
      ? tab
      : 'overview';

  const { minScore, todayQueries } = getOutreachIcpChecklistMeta();

  return (
    <Suspense fallback={<div className="text-sm text-axon-muted">Loading NI Outreach HQ…</div>}>
      <OutreachHqTool
        stats={stats}
        leads={leads}
        training={training}
        todayQueries={todayQueries}
        minScore={minScore}
        basePath={basePath}
        initialTab={initialTab}
        pipelineFilter={tab === 'pipeline' ? status : undefined}
        followUpPending={followUp.pending}
        followUpDone={followUp.done}
      />
    </Suspense>
  );
}
