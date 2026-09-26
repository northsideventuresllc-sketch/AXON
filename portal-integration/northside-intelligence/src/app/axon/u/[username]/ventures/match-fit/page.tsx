import { MatchFitVentureHub } from '@/components/axon/match-fit-venture-hub';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonMatchFitVenturePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  await requireAxonPortalUser(params.username);
  return <MatchFitVentureHub />;
}
