import { TopNav } from '@/components/axon-v0/top-nav';

export default function AxonV0Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#07080C] text-slate-100">
      {/* slow holographic wave behind every window */}
      <div className="v0-wave-layer" />
      <div className="v0-wave-layer v0-wave-2" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <TopNav />
        <main className="v0-page min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
