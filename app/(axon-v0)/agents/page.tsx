'use client';

import Link from 'next/link';
import { AgentsBoard } from '@/components/axon-v0/agents-board';

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl">AGENTS</h1>
      <p className="mt-2 text-sm text-slate-400">
        Every agent across your ventures — grouped by venture, each with task completion, status, and
        assignment.
      </p>
      <AgentsBoard />
    </div>
  );
}
