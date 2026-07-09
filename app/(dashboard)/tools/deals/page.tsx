import { DealTrackerTool } from '@/components/axon/deal-tracker-tool';

export const dynamic = 'force-dynamic';

export default function DealsToolPage() {
  return (
    <div className="p-6">
      <DealTrackerTool />
    </div>
  );
}
