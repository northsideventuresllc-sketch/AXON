import { Sidebar } from '@/components/axon/sidebar';
import { AxonAmbientBg } from '@/components/axon/axon-ambient-bg';
import { InactivityGuard } from '@/components/axon/inactivity-guard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen bg-axon-bg">
      <InactivityGuard />
      <AxonAmbientBg />
      <Sidebar />
      <main className="axon-grid-bg relative z-10 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto max-w-[1720px] px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
