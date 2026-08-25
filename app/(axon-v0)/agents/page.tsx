import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl">AGENTS</h1>
      <p className="mt-2 text-sm text-slate-400">
        Every agent across your ventures — grouped by venture, with task completion and assignment. Landing here in this build.
      </p>
      <div className="v0-panel mt-6 p-6 text-sm text-slate-500">Wiring in progress…</div>
    </div>
  );
}
