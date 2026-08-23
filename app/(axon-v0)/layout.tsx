import Link from 'next/link';

const LEFT_NAV = [
  { href: '/', label: 'Command' },
  { href: '/brain', label: 'Brain' },
  { href: '/toolkit', label: 'AXON Toolkit' },
  { href: '/models', label: 'Settings · Models' },
  { href: '/legacy', label: 'Legacy dash' },
];

export default function AxonV0Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07080C] text-slate-100">
      {/* slow holographic wave behind every window */}
      <div className="v0-wave-layer" />
      <div className="v0-wave-layer v0-wave-2" />

      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-cyan-400/10 bg-black/30 p-4 backdrop-blur md:flex">
          <p className="mb-4 text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">
            NORTHSiDE Intelligence
          </p>
          {LEFT_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-cyan-400/10 hover:text-cyan-200"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-auto text-[10px] uppercase tracking-[0.25em] text-slate-500">
            AXON v0 · Harness
          </div>
        </aside>

        <main className="v0-page min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
