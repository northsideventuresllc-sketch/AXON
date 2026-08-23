'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';

interface CatalogTool {
  slug: string;
  name: string;
  icon: string;
}

interface VentureToolRow {
  id: string;
  tool_slug: string;
  display_name: string | null;
  notes: string | null;
}

interface Venture {
  id: string;
  name: string;
  tools: VentureToolRow[];
}

export default function ToolkitPage() {
  const [catalog, setCatalog] = useState<CatalogTool[]>([]);
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [open, setOpen] = useState<string | null>(null); // tool slug with the assign form open
  const [form, setForm] = useState({ ventureId: '', displayName: '', notes: '' });
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/venture-tools'))
      .then((r) => r.json())
      .then((d) => setCatalog(d.catalog || []))
      .catch(() => {});
    fetch(apiUrl('/api/axon-v0/ventures'))
      .then((r) => r.json())
      .then((d) => setVentures(d.ventures || []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function assign(slug: string) {
    if (!form.ventureId) return;
    setStatus('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/venture-tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ventureId: form.ventureId,
          toolSlug: slug,
          displayName: form.displayName.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Assignment failed.');
      setOpen(null);
      setForm({ ventureId: '', displayName: '', notes: '' });
      setStatus('Tool plugged in.');
      load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Assignment failed.');
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl">AXON Toolkit</h1>
      <p className="mt-2 text-sm text-slate-400">
        Every tool you own. Plug any of them into a venture and customize how it shows up there.
      </p>
      {status && <p className="mt-2 text-xs text-cyan-200/80">{status}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {catalog.map((t) => {
          const usedBy = ventures.filter((v) => v.tools.some((x) => x.tool_slug === t.slug));
          const isOpen = open === t.slug;
          return (
            <div key={t.slug} className="v0-panel p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-slate-100">
                    {t.icon} {t.name}
                  </p>
                  {usedBy.length > 0 && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Plugged into:{' '}
                      {usedBy.map((v, i) => (
                        <span key={v.id}>
                          {i > 0 && ' · '}
                          <Link href={`/v/${v.id}`} className="text-cyan-300/80 hover:text-cyan-200">
                            {v.tools.find((x) => x.tool_slug === t.slug)?.display_name || v.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setOpen(isOpen ? null : t.slug);
                    setForm({ ventureId: ventures[0]?.id || '', displayName: '', notes: '' });
                  }}
                  className="v0-chip text-cyan-200"
                >
                  {isOpen ? '✕' : '＋ plug in'}
                </button>
              </div>

              {isOpen && (
                <div className="v0-rise mt-3 space-y-2 border-t border-cyan-400/10 pt-3">
                  <select
                    value={form.ventureId}
                    onChange={(e) => setForm({ ...form, ventureId: e.target.value })}
                    className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  >
                    {ventures.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    placeholder={`Name inside that venture (default: ${t.name})`}
                    className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  />
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Venture-specific notes (optional)"
                    className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                  />
                  <button
                    onClick={() => assign(t.slug)}
                    className="w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
                  >
                    Plug it in
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="v0-panel mt-6 p-4 opacity-70">
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Tool Maker</p>
        <p className="mt-1 text-sm text-slate-400">
          Build brand-new tools by chatting with AXON — arrives in a later build.
        </p>
      </div>
    </div>
  );
}
