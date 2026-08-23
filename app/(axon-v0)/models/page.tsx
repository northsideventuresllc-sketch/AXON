'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';

interface Provider {
  id: string;
  label: string;
  kind: string;
  base_url: string | null;
  model: string;
  has_key: boolean;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface Venture {
  id: string;
  name: string;
  agents: Agent[];
}

const TIER_CHAIN = [
  'AXON local (Mac mini)',
  'RunPod AXON v1',
  'Gemini primary',
  'Gemini backup',
  'Claude (last resort)',
];

export default function ModelsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [form, setForm] = useState({ label: '', kind: 'openai-compatible', base_url: '', model: '', api_key: '' });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    fetch(apiUrl('/api/axon-v0/providers'))
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || []))
      .catch(() => {});
    fetch(apiUrl('/api/axon-v0/ventures'))
      .then((r) => r.json())
      .then((d) => setVentures(d.ventures || []))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function addProvider(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.model.trim()) return;
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch(apiUrl('/api/axon-v0/providers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not save the model.');
      setForm({ label: '', kind: 'openai-compatible', base_url: '', model: '', api_key: '' });
      setStatus('Model saved. The key never leaves the server.');
      load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save the model.');
    } finally {
      setSaving(false);
    }
  }

  async function assign(agentId: string, value: string) {
    const body =
      value === 'auto'
        ? { assign: { agentId, mode: 'auto', providerId: null } }
        : { assign: { agentId, mode: 'fixed', providerId: value } };
    await fetch(apiUrl('/api/axon-v0/providers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
    setStatus('Routing updated.');
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-cyan-300">
        ← Command deck
      </Link>
      <h1 className="v0-neon mt-1 text-3xl">Omni-Router</h1>
      <p className="mt-2 text-sm text-slate-400">
        Plug in any model. Every agent runs on <b>AXON auto</b> unless you pin it to one of yours.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Tier chain + BYO models */}
        <div className="space-y-6">
          <section className="v0-panel p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">AXON auto — the tier chain</p>
            <ol className="mt-3 space-y-1.5 font-mono text-xs text-slate-300">
              {TIER_CHAIN.map((t, i) => (
                <li key={t}>
                  <span className="text-cyan-300/70">{i + 1}.</span> {t}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] text-slate-500">
              Tries each tier in order and falls through automatically when one is down.
            </p>
          </section>

          <section className="v0-panel p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Your models</p>
            <div className="mt-2 space-y-2">
              {providers.length === 0 && <p className="text-xs text-slate-500">None added yet.</p>}
              {providers.map((p) => (
                <div key={p.id} className="rounded-lg border border-cyan-400/10 bg-black/30 px-3 py-2">
                  <p className="text-sm text-slate-200">{p.label}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                    {p.kind} · {p.model} {p.has_key ? '· 🔑 key stored' : '· no key'}
                  </p>
                </div>
              ))}
            </div>

            <form onSubmit={addProvider} className="mt-4 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Add a model</p>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Name (e.g. My GPT key)"
                className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                  className="rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                >
                  <option value="openai-compatible">OpenAI-compatible</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                  <option value="ollama">Ollama (local)</option>
                </select>
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="Model id"
                  className="rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
                />
              </div>
              <input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="Base URL (optional)"
                className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
              />
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                placeholder="API key (stored server-side only)"
                className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-cyan-400/60"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save model'}
              </button>
            </form>
            {status && <p className="mt-2 text-[11px] text-cyan-200/80">{status}</p>}
          </section>
        </div>

        {/* Per-agent routing */}
        <section className="v0-panel p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Who runs on what</p>
          <div className="mt-3 space-y-4">
            {ventures.map((v) => (
              <div key={v.id}>
                <p className="text-xs font-medium text-slate-300">{v.name}</p>
                <div className="mt-1.5 space-y-1.5">
                  {v.agents.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-slate-400">{a.name}</span>
                      <select
                        defaultValue="auto"
                        onChange={(e) => assign(a.id, e.target.value)}
                        className="rounded-md border border-cyan-400/20 bg-black/50 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-400/60"
                      >
                        <option value="auto">AXON auto</option>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {ventures.length === 0 && <p className="text-xs text-slate-500">No ventures yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
