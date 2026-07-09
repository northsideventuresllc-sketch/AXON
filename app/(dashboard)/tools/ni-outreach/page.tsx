import { Suspense } from 'react';
import { fetchLeads, fetchPipelineStats, getClient, enrichLead } from '@/lib/leads';
import { getOutreachTrainingSummary, getOutreachIcpChecklistMeta } from '@/lib/outreach-learn';
import { OutreachHqTool } from '@/components/axon/outreach-hq-tool';
import { SOURCE } from '@/lib/constants.mjs';
import type { Lead } from '@/lib/types';

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

export default async function NiOutreachToolPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const { tab, status } = await searchParams;
  const [stats, leads, training, followUp] = await Promise.all([
    fetchPipelineStats(),
    fetchLeads(500),
    getOutreachTrainingSummary(),
    fetchSentLeads(),
  ]);
  const { minScore, todayQueries } = getOutreachIcpChecklistMeta();
  const initialTab =
    tab === 'queue' || tab === 'pipeline' || tab === 'follow-up' || tab === 'overview'
      ? tab
      : 'overview';

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
        followUpPending={followUp.pending}
        followUpDone={followUp.done}
      />
    </Suspense>
  );
}
