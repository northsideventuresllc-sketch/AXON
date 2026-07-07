import { requireAxonPortalUser } from '@/lib/axon/portal-guard';
import type { Metadata } from 'next';
import { AxonAmbientBg } from '@/components/axon-ui/axon-ambient-bg';
import { Sidebar } from '@/components/axon-ui/sidebar';
import { axonPublicPath } from '@/lib/axon/paths';
import '@/styles/axon.css';

export const metadata: Metadata = {
  title: 'AXON Command | Northside Intelligence',
};

export const dynamic = 'force-dynamic';

export default async function AxonUserLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { username: string };
}) {
  const { username } = await requireAxonPortalUser(params.username);
  const basePath = axonPublicPath(username);

  return (
    <main className="relative min-h-screen overflow-hidden bg-axon-bg text-axon-text">
      <div className="relative flex min-h-screen">
        <AxonAmbientBg />
        <Sidebar basePath={basePath} />
        <div className="axon-grid-bg relative z-10 flex-1 overflow-auto">
          <div className="mx-auto max-w-[1720px] px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
