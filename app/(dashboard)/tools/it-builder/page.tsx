import { ItBuilderTool } from '@/components/axon/it-builder-tool';
import { Suspense } from 'react';

export default function ItBuilderPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-axon-muted">Loading builder…</div>}>
      <ItBuilderTool />
    </Suspense>
  );
}
