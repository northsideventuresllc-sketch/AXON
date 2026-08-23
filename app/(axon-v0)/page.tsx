import Link from 'next/link';
import { OrbHome } from '@/components/axon-v0/orb-home';
import { VentureCarousel } from '@/components/axon-v0/venture-carousel';
import { NotificationsBoard } from '@/components/axon-v0/notifications-board';
import { QuickLinksRail } from '@/components/axon-v0/quick-links-rail';

export const dynamic = 'force-dynamic';

export default function AxonV0Home() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <OrbHome />
          <VentureCarousel />
        </div>

        <div className="space-y-4">
          <NotificationsBoard />
          <QuickLinksRail />
          <div className="v0-panel p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Shortcuts</p>
            <div className="mt-2 grid gap-1.5 text-sm">
              <Link href="/brain" className="text-slate-300 hover:text-cyan-200">🧠 Brain graph</Link>
              <Link href="/toolkit" className="text-slate-300 hover:text-cyan-200">🧰 AXON Toolkit</Link>
              <Link href="/models" className="text-slate-300 hover:text-cyan-200">⚙ Models & routing</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
