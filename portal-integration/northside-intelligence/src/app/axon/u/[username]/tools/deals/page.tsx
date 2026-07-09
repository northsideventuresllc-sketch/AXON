import { DealTrackerTool } from '@/components/axon-ui/deal-tracker-tool';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export default async function AxonDealsPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  return (
    <div className="p-6">
      <DealTrackerTool basePath={basePath} />
    </div>
  );
}
