import { redirect } from 'next/navigation';
import { axonPublicPath } from '@/lib/axon/paths';
import { appPath } from '@/lib/axon/app-path';
import { requireAxonPortalUser } from '@/lib/axon/portal-guard';

export default async function AxonQueuePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(params.username);
  redirect(appPath('/tools/ni-outreach?tab=queue', basePath));
}
