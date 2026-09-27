import { DispatchQueuePanel } from '@/components/axon/dispatch-queue-panel';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonDispatchPage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  await requireAxonPortalUser(params.username);

  return (
    <div className="p-6">
      <DispatchQueuePanel />
    </div>
  );
}
