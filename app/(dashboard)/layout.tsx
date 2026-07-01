import { Sidebar } from '@/components/axon/sidebar';
import { AxonAmbientBg } from '@/components/axon/axon-ambient-bg';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen bg-axon-bg">
      <AxonAmbientBg />
      <Sidebar />
      <main className="axon-grid-bg relative z-10 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1600px] px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
