'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AgentsBoard } from '@/components/axon-v0/agents-board';
import { AgentCommsFeed } from '@/components/axon-v0/agent-comms-feed';
import { FleetStatusStrip } from '@/components/axon-v0/fleet-status-strip';

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'comms', label: 'Comms' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function AgentsPage() {
  const [tab, setTab] = useState<TabId>('board');

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

      <div className="mt-4 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`v0-chip ${tab === t.id ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'board' ? (
        <AgentsBoard />
      ) : (
        <div className="mt-6 space-y-6">
          <FleetStatusStrip />
          <AgentCommsFeed />
        </div>
      )}
    </div>
  );
}
