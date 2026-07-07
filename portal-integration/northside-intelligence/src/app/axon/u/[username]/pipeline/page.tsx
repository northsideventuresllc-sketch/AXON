import { redirect } from 'next/navigation';
import { axonPublicPath } from '@/lib/axon/paths';
import { appPath } from '@/lib/axon/app-path';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export default async function AxonPipelinePage({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams: { status?: string };
}) {
  await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(params.username);
  const { status } = searchParams;
  const query = status ? `tab=pipeline&status=${encodeURIComponent(status)}` : 'tab=pipeline';
  redirect(appPath(`/tools/ni-outreach?${query}`, basePath));
}
