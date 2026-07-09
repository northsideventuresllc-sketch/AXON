import { HermesSyncTool } from '@/components/axon-ui/hermes-sync-tool';
import { axonPublicPath } from '@/lib/axon/paths';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export default async function AxonHermesPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  return (
    <div className="p-6">
      <HermesSyncTool basePath={basePath} />
    </div>
  );
}
