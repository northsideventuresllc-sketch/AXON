import Link from 'next/link';
import { LeadDetailView } from '@/components/axon-ui/lead-detail';
import { fetchLeadById } from '@/lib/axon/leads';
import { axonPublicPath } from '@/lib/axon/paths';
import { appPath } from '@/lib/axon/app-path';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AxonLeadPage({
  params,
}: {
  params: { username: string; id: string };
}) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);
  const lead = await fetchLeadById(params.id);
  if (!lead) notFound();

  return (
    <div className="space-y-6">
      <Link
        href={appPath('/tools/ni-outreach?tab=pipeline', basePath)}
        className="text-sm text-axon-muted hover:text-axon-gold"
      >
        ← Back to pipeline
      </Link>
      <LeadDetailView lead={lead} />
    </div>
  );
}
