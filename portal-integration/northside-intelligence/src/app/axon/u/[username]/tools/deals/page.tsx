import { ToolPlaceholder } from '@/components/axon-ui/tool-placeholder';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export default async function AxonDealsPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  return (
    <ToolPlaceholder
      title="Deal Tracker"
      description="Track proposals, negotiations, and closed-won revenue across the pipeline."
      basePath={basePath}
    />
  );
}
