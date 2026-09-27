import { MatchFitAdminTool } from '@/components/axon-ui/match-fit-admin-tool';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonMatchFitAdminPage(
  props: {
    params: Promise<{ username: string }>;
  }
) {
  const params = await props.params;
  await requireAxonPortalUser(params.username);

  return <MatchFitAdminTool />;
}
