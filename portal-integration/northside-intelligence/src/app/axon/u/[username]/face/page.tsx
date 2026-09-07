import { FaceHero } from '@/components/axon-ui/face-hero';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

/**
 * THE FACE — AXON's Dash home screen, mounted inside the NI portal
 * (FACE-PORTAL-MOUNT-0906). Mirrors AXON's `app/(axon-v0)/page.tsx`, which renders the
 * same `FaceHero` component at `/` in the standalone AXON app.
 *
 * `requireAxonPortalUser` is the page-level guard every other `/axon/u/[username]/*`
 * route in this portal uses (see the sibling `dashboard/page.tsx`) — it redirects to
 * sign-in / the AXON entry page when the session, the `[username]` param, or
 * `canEnterAxonPortal` don't line up. THE FACE stays behind that same operator login;
 * it is not public.
 *
 * `FaceHero` itself needs no props: its data comes from polling
 * `/api/axon-v0/face/{summary,plan,needs-me,activity}` directly (see
 * `src/app/api/axon-v0/face/*`), each of which awaits `requireAxonOperatorId()` before
 * any read — so the page guard and the API guard are both in force for this screen.
 */
export const dynamic = 'force-dynamic';

export default async function AxonFacePage({
  params,
}: {
  params: { username: string };
}) {
  await requireAxonPortalUser(params.username);

  return <FaceHero />;
}
