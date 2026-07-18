import { RedditQueuesTool } from '@/components/axon/reddit-queues-tool';

export const dynamic = 'force-dynamic';

export default function RedditToolPage() {
  return (
    <div className="p-6">
      <RedditQueuesTool />
    </div>
  );
}
