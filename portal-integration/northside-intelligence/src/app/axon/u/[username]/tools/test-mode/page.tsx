import { TestModeTool } from '@/components/axon-ui/test-mode-tool';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonTestModePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  await requireAxonPortalUser(params.username);

  return (
    <div className="p-2">
      <TestModeTool />
    </div>
  );
}
