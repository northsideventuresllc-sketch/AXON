'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import type { Venture, VentureAgent, VentureTool } from '@/lib/axon-v0/types';

type VentureCard = Venture & { agents: VentureAgent[]; tools: VentureTool[] };

export function VentureCarousel() {
  const [ventures, setVentures] = useState<VentureCard[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const r = await fetch(apiUrl('/api/axon-v0/ventures'));
      const data = await r.json();
      if (r.ok) setVentures(data.ventures || []);
      else setError(data.error || 'Failed to load ventures');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ventures');
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const r = await fetch(apiUrl('/api/axon-v0/ventures'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tagline }),
    });
    if (r.ok) {
      setName('');
      setTagline('');
      setAdding(false);
      load();
    } else {
      const data = await r.json().catch(() => ({}));
      setError(data.error || 'Failed to create venture');
    }
  }

  return (
    // No entrance animation on this section: scroll-snap resnaps mid-transform and lands on the last card.
    <section className="mt-8">
      <p className="mb-3 text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">Ventures</p>
      {error && <p className="mb-2 text-xs text-rose-300">{error}</p>}
      <div className="v0-carousel flex gap-4 overflow-x-auto pb-4">
        {ventures.map((v) => (
          <Link
            key={v.id}
            href={`/v/${v.id}`}
            className="v0-panel v0-holo-card w-60 shrink-0 p-4"
            style={{ borderColor: `${v.accent}33` }}
          >
            <div
              className="h-1 w-10 rounded-full"
              style={{ background: v.accent, boxShadow: `0 0 12px ${v.accent}` }}
            />
            <h3 className="mt-3 text-lg font-semibold text-slate-100">{v.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{v.tagline || '—'}</p>
            <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-300/70">
              <span>{v.agents.length} agents</span>
              <span className="opacity-40">·</span>
              <span>{v.tools.length} tools</span>
            </div>
          </Link>
        ))}

        {/* Add venture — always at the right end of the carousel */}
        <div className="v0-panel w-60 shrink-0 p-4">
          {!adding ? (
            <button
              onClick={() => setAdding(true)}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-cyan-300/80 transition hover:text-cyan-100"
            >
              <span className="text-3xl">＋</span>
              <span className="text-xs uppercase tracking-[0.25em]">New venture</span>
              <span className="text-[10px] text-slate-500">5 default agents auto-built</span>
            </button>
          ) : (
            <form onSubmit={create} className="space-y-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Venture name"
                className="w-full rounded-lg border border-cyan-400/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              />
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Tagline (optional)"
                className="w-full rounded-lg border border-cyan-400/20 bg-black/40 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              />
              <div className="flex gap-2">
                <button type="submit" className="v0-chip bg-cyan-400/15 text-cyan-100">Create</button>
                <button type="button" onClick={() => setAdding(false)} className="v0-chip text-slate-400">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
