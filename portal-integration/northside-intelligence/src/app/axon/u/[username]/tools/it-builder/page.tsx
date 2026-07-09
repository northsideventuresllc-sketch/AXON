import { ItBuilderTool } from '@/components/axon-ui/it-builder-tool';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';
import { axonPublicPath } from '@/lib/axon/paths';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function AxonItBuilderPage({ params }: { params: { username: string } }) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  return (
    <Suspense fallback={<div className="p-6 text-sm text-axon-muted">Loading builder…</div>}>
      <ItBuilderTool basePath={basePath} />
    </Suspense>
  );
}
