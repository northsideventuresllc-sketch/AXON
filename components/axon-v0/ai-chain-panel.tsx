'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';

type Tier = 'local' | 'runpod' | 'openrouter' | 'gemini' | 'anthropic';

interface ChainTier {
  tier: Tier;
  position: number;
  enabled: boolean;
  hasOwnKey: boolean;
  last4: string | null;
}

// Plain-English labels — never a raw tier id on screen (matches lib/axon-v0/plain-labels.ts).
const TIER_LABEL: Record<Tier, string> = {
  local: 'Your Mac Mini (local, free)',
  runpod: 'RunPod — AXON v1 (free)',
  openrouter: 'OpenRouter — free models',
  gemini: 'Google Gemini Flash (free)',
  anthropic: 'Claude (paid — last resort)',
};

const TIER_HINT: Record<Tier, string> = {
  local: 'Runs on the Mac mini. No key needed here.',
  runpod: "NVG's own model. Not live yet — this tier is skipped until it is.",
  openrouter: 'Free community models. Uses the shared NVG key unless you add your own below.',
  gemini: 'Free Google key. Uses the shared NVG key unless you add your own below.',
  anthropic: 'Costs money. Only used when everything above it is down or disabled.',
};

const KEY_PROVIDERS: Tier[] = ['runpod', 'openrouter', 'gemini', 'anthropic'];

export function AiChainPanel() {
  const [tiers, setTiers] = useState<ChainTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [usingDefault, setUsingDefault] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [keyBusy, setKeyBusy] = useState<Tier | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(apiUrl('/api/axon-v0/router/chain-config'))
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTiers(data.tiers || []);
        setUsingDefault(!!data.usingDefault);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your AI chain'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(next: ChainTier[]) {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/axon-v0/router/chain-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiers: next.map((t) => ({ tier: t.tier, position: t.position, enabled: t.enabled })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not save');
      setTiers(next);
      setUsingDefault(false);
      setStatus('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your AI chain');
    } finally {
      setSaving(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= tiers.length) return;
    const next = tiers.slice();
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((t, i) => (t.position = i));
    save(next);
  }

  function toggleEnabled(index: number) {
    const next = tiers.slice();
    next[index] = { ...next[index], enabled: !next[index].enabled };
    save(next);
  }

  async function resetDefault() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/axon-v0/router/chain-config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not reset');
      setStatus('Back to the default order.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your AI chain');
    } finally {
      setSaving(false);
    }
  }

  async function saveKey(provider: Tier) {
    const key = (keyDrafts[provider] || '').trim();
    if (!key) return;
    setKeyBusy(provider);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/axon-v0/router/keys/${provider}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not save that key');
      setTiers((prev) =>
        prev.map((t) => (t.tier === provider ? { ...t, hasOwnKey: true, last4: data.last4 ?? null } : t)),
      );
      setKeyDrafts((prev) => ({ ...prev, [provider]: '' }));
      setStatus('Key saved. Your calls to this provider now use your own key.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that key');
    } finally {
      setKeyBusy(null);
    }
  }

  async function removeKey(provider: Tier) {
    setKeyBusy(provider);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/axon-v0/router/keys/${provider}`), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Could not remove that key');
      setTiers((prev) => (prev.map((t) => (t.tier === provider ? { ...t, hasOwnKey: false, last4: null } : t))));
      setStatus('Key removed. Back to the shared NVG key.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that key');
    } finally {
      setKeyBusy(null);
    }
  }

  if (loading) return <p className="text-xs text-slate-500">Loading your AI chain…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          {usingDefault
            ? 'Using the default order.'
            : 'Your own order — different from the default.'}{' '}
          AXON tries each one top to bottom and moves to the next only if one is off or unavailable.
        </p>
        <button
          type="button"
          onClick={resetDefault}
          disabled={saving || usingDefault}
          className="rounded-md border border-cyan-400/20 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-400/50 disabled:opacity-40"
        >
          Reset to default
        </button>
      </div>

      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      {status && <p className="text-[11px] text-cyan-200/80">{status}</p>}

      <ol className="space-y-2">
        {tiers.map((t, i) => (
          <li
            key={t.tier}
            className={`rounded-lg border p-3 ${
              t.enabled ? 'border-cyan-400/15 bg-black/20' : 'border-white/5 bg-black/10 opacity-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-200">
                  <span className="mr-2 text-cyan-300/70">{i + 1}.</span>
                  {TIER_LABEL[t.tier]}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">{TIER_HINT[t.tier]}</p>
                {t.hasOwnKey && KEY_PROVIDERS.includes(t.tier) && (
                  <p className="mt-0.5 text-[11px] text-emerald-300/80">Using your own key (•••• {t.last4})</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Move up"
                  onClick={() => move(i, -1)}
                  disabled={saving || i === 0}
                  className="rounded border border-cyan-400/20 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-cyan-400/50 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  onClick={() => move(i, 1)}
                  disabled={saving || i === tiers.length - 1}
                  className="rounded border border-cyan-400/20 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-cyan-400/50 disabled:opacity-30"
                >
                  ↓
                </button>
                <label className="ml-1 flex items-center gap-1 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={t.enabled}
                    disabled={saving}
                    onChange={() => toggleEnabled(i)}
                  />
                  On
                </label>
              </div>
            </div>

            {KEY_PROVIDERS.includes(t.tier) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Your own API key (optional)"
                  value={keyDrafts[t.tier] || ''}
                  onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [t.tier]: e.target.value }))}
                  className="min-w-0 flex-1 rounded-md border border-cyan-400/20 bg-black/50 px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-400/60"
                />
                <button
                  type="button"
                  onClick={() => saveKey(t.tier)}
                  disabled={keyBusy === t.tier || !(keyDrafts[t.tier] || '').trim()}
                  className="rounded-md border border-cyan-400/20 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-400/50 disabled:opacity-40"
                >
                  Save
                </button>
                {t.hasOwnKey && (
                  <button
                    type="button"
                    onClick={() => removeKey(t.tier)}
                    disabled={keyBusy === t.tier}
                    className="rounded-md border border-rose-400/20 px-2 py-1 text-[11px] text-rose-300 hover:border-rose-400/50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
