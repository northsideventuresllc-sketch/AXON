import { DispatchQueuePanel } from '@/components/axon-ui/dispatch-queue-panel';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonDispatchPage({ params }: { params: { username: string } }) {
  await requireAxonPortalUser(params.username);

  return (
    <div className="p-6">
      <DispatchQueuePanel />
    </div>
  );
}
