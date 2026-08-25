'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import { AXON_USER_TOOLS } from '@/lib/axon-user-tools';
import { getAxonToolMeta } from '@/lib/axon-tool-meta';
import { ToolDetailModal, type ToolkitToolView } from '@/components/axon-v0/tool-detail-modal';
import { ToolMaker } from '@/components/axon-v0/tool-maker';
import './toolkit.css';

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
interface CustomTool {
  slug: string;
  name: string;
  sourceType: 'custom';
  notes: string;
  icon: string;
}

const SOURCE_LABEL: Record<ToolkitToolView['sourceType'], string> = {
  outreach_engine: 'Outreach Engine',
  it_clone: 'IT Clone',
  custom: 'Custom Tool',
};

export default function ToolkitPage() {
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [custom, setCustom] = useState<CustomTool[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [detail, setDetail] = useState<ToolkitToolView | null>(null);
  const [makerOpen, setMakerOpen] = useState(false);
  const [assignSlug, setAssignSlug] = useState<string | null>(null);
  const [form, setForm] = useState({ ventureId: '', displayName: '', notes: '' });
  const [itName, setItName] = useState('');
  const [status, setStatus] = useState('');

  const loadTools = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/tools'))
      .then((r) => r.json())
      .then((d) => {
        setCustom(d.tools || []);
        setHidden(d.hidden || []);
      })
      .catch(() => {});
  }, []);

  const loadVentures = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/ventures'))
      .then((r) => r.json())
      .then((d) => setVentures(d.ventures || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTools();
    loadVentures();
  }, [loadTools, loadVentures]);

  const usedByFor = useCallback(
    (slug: string) =>
      ventures
        .filter((v) => v.tools.some((x) => x.tool_slug === slug))
        .map((v) => ({
          id: v.id,
          name: v.tools.find((x) => x.tool_slug === slug)?.display_name || v.name,
        })),
    [ventures]
  );

  // Master list: built-ins (minus hidden) + custom tools.
  const tools = useMemo<ToolkitToolView[]>(() => {
    const builtin: ToolkitToolView[] = AXON_USER_TOOLS.filter((t) => !hidden.includes(t.slug)).map((t) => ({
      slug: t.slug,
      name: t.defaultDisplayName,
      icon: t.icon,
      sourceType: t.sourceType,
      href: t.href,
      setupDescription: getAxonToolMeta(t).setupDescription,
      isCustom: false,
      usedBy: usedByFor(t.slug),
    }));
    const customViews: ToolkitToolView[] = custom.map((c) => ({
      slug: c.slug,
      name: c.name,
      icon: c.icon || '🛠',
      sourceType: 'custom',
      setupDescription:
        c.notes?.trim() ||
        `${c.name} is a custom tool you built with the Tool Maker. Plug it into a venture to start using it.`,
      isCustom: true,
      usedBy: usedByFor(c.slug),
    }));
    return [...builtin, ...customViews];
  }, [custom, hidden, usedByFor]);

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
      setAssignSlug(null);
      setForm({ ventureId: '', displayName: '', notes: '' });
      setStatus('Tool plugged in.');
      loadVentures();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Assignment failed.');
    }
  }

  async function del(slug: string, isCustom: boolean) {
    setStatus('');
    setDetail(null);
    try {
      await fetch(apiUrl('/api/axon-v0/tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', slug }),
      });
      setStatus(isCustom ? 'Custom tool removed.' : 'Tool hidden from your toolkit.');
      loadTools();
    } catch {
      setStatus('Delete failed.');
    }
  }

  async function makeIt() {
    const name = itName.trim();
    if (!name) return;
    setStatus('');
    try {
      await fetch(apiUrl('/api/axon-v0/tools'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'from_it', name }),
      });
      setItName('');
      setStatus(`"${name}" registered as an AXON tool.`);
      loadTools();
    } catch {
      setStatus('Could not register that IT.');
    }
  }

  function openAssign(slug: string) {
    setDetail(null);
    setAssignSlug(slug);
    setForm({ ventureId: ventures[0]?.id || '', displayName: '', notes: '' });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl tracking-[0.14em]">AXON TOOLKIT</h1>
      <p className="mt-2 text-sm text-slate-400">
        Every tool you own. Click any tool to see how it works, plug it into a venture, or build a brand-new one.
      </p>
      {status && <p className="mt-2 text-xs text-cyan-200/80">{status}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setMakerOpen(true)}
          className="tk-live-ring rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
        >
          🛠 Tool Maker
        </button>
        <div className="flex flex-1 gap-2 sm:max-w-md">
          <input
            value={itName}
            onChange={(e) => setItName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && makeIt()}
            placeholder="Make an IT into an AXON tool — name it…"
            className="min-w-0 flex-1 rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
          />
          <button
            onClick={makeIt}
            disabled={!itName.trim()}
            className="whitespace-nowrap rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400/40 disabled:opacity-40"
          >
            🧬 Register
          </button>
        </div>
      </div>

      <div id="assign" className="mt-6 grid gap-3 sm:grid-cols-2">
        {tools.map((t, i) => {
          const isAssign = assignSlug === t.slug;
          return (
            <div key={t.slug} className="tk-card v0-panel p-4" style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={() => setDetail(t)}
                  className="flex flex-1 items-start gap-3 text-left"
                >
                  <span className="tk-icon-badge">{t.icon}</span>
                  <span>
                    <span className="block text-sm text-slate-100">{t.name}</span>
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      <span className={`tk-source-dot tk-src-${t.sourceType}`} />
                      {SOURCE_LABEL[t.sourceType]}
                    </span>
                    {t.usedBy.length > 0 && (
                      <span className="mt-1 block text-[11px] text-slate-500">
                        Plugged into {t.usedBy.map((v) => v.name).join(' · ')}
                      </span>
                    )}
                  </span>
                </button>
                <div className="flex flex-col gap-1">
                  <button onClick={() => openAssign(t.slug)} className="v0-chip text-cyan-200" title="Plug into a venture">
                    ＋
                  </button>
                  <button
                    onClick={() => del(t.slug, t.isCustom)}
                    className="v0-chip text-rose-300/80 hover:text-rose-200"
                    title={t.isCustom ? 'Delete custom tool' : 'Hide from toolkit'}
                  >
                    🗑
                  </button>
                </div>
              </div>

              {isAssign && (
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => assign(t.slug)}
                      className="flex-1 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
                    >
                      Plug it in
                    </button>
                    <button
                      onClick={() => setAssignSlug(null)}
                      className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-300 hover:border-cyan-400/40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {detail && (
        <ToolDetailModal
          tool={detail}
          onClose={() => setDetail(null)}
          onPlugIn={(slug) => openAssign(slug)}
        />
      )}
      {makerOpen && (
        <ToolMaker
          onClose={() => setMakerOpen(false)}
          onCreated={loadTools}
        />
      )}
    </div>
  );
}
