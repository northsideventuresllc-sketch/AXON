import { Suspense } from 'react';
import { FollowUpTool } from '@/components/axon-ui/follow-up-tool';
import { fetchLeads } from '@/lib/axon/leads';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonFollowUpPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  const leads = await fetchLeads(200);
  const sent = leads.filter((l) => l.status === 'sent');
  const pending = sent.filter((l) => !l.meta.follow_up_sent_at);
  const done = sent.filter((l) => !!l.meta.follow_up_sent_at);

  return (
    <Suspense fallback={<div className="text-sm text-axon-muted">Loading Follow-Up Engine…</div>}>
      <FollowUpTool pending={pending} done={done} basePath={basePath} />
    </Suspense>
  );
}
