import { DispatchQueuePanel } from '@/components/axon/dispatch-queue-panel';

export const dynamic = 'force-dynamic';

export default function DispatchToolPage() {
  return (
    <div className="p-6">
      <DispatchQueuePanel />
    </div>
  );
}
