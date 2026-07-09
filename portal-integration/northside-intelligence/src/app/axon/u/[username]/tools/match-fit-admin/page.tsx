import { MatchFitAdminTool } from '@/components/axon-ui/match-fit-admin-tool';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonMatchFitAdminPage({
  params,
}: {
  params: { username: string };
}) {
  await requireAxonPortalUser(params.username);

  return <MatchFitAdminTool />;
}
