import { ToolPlaceholder } from '@/components/axon-ui/tool-placeholder';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export default async function AxonFollowUpPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  return (
    <ToolPlaceholder
      title="Follow-Up Engine"
      description="Automated follow-up sequences for sent outreach. Haiku drafts are ready in the backend — wiring in progress."
      basePath={basePath}
    />
  );
}
