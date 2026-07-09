import { Suspense } from 'react';
import { getClient, enrichLead } from '@/lib/leads';
import { SOURCE } from '@/lib/constants.mjs';
import type { Lead } from '@/lib/types';
import { FollowUpTool } from '@/components/axon/follow-up-tool';

export const dynamic = 'force-dynamic';

async function fetchSentLeads() {
  const { sbSelect } = getClient();
  const rows = (await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&status=eq.sent&select=*&order=created_at.desc&limit=200`
  )) as Lead[];

  const leads = (rows || []).map(enrichLead);
  const pending = leads.filter((l) => !l.meta.follow_up_sent_at);
  const done = leads.filter((l) => !!l.meta.follow_up_sent_at);
  return { pending, done };
}

export default async function FollowUpToolPage() {
  const { pending, done } = await fetchSentLeads();

  return (
    <Suspense fallback={<div className="text-sm text-axon-muted">Loading Follow-Up Engine…</div>}>
      <FollowUpTool pending={pending} done={done} />
    </Suspense>
  );
}
