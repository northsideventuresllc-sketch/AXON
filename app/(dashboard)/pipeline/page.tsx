import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const query = status ? `tab=pipeline&status=${encodeURIComponent(status)}` : 'tab=pipeline';
  redirect(`/tools/ni-outreach?${query}`);
}
