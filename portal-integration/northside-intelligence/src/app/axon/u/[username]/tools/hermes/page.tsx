import { ToolPlaceholder } from '@/components/axon-ui/tool-placeholder';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export default async function AxonHermesPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  return (
    <ToolPlaceholder
      title="Hermes Task Sync"
      description="Mirror Hermes marketing tasks into AXON. Sync only — no LLM overlap per guardrails."
      basePath={basePath}
    />
  );
}
