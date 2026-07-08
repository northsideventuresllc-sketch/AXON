import { MatchFitVentureHub } from '@/components/axon/match-fit-venture-hub';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export const dynamic = 'force-dynamic';

export default async function AxonMatchFitVenturePage({ params }: { params: { username: string } }) {
  await requireAxonPortalUser(params.username);
  return <MatchFitVentureHub />;
}
