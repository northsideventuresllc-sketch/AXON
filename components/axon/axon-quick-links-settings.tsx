'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import {
  DEFAULT_QUICK_LINKS,
  MAX_QUICK_LINKS,
  readQuickLinksFromStorage,
  writeQuickLinksToStorage,
  type AxonQuickLink,
} from '@/lib/axon-quick-links';

function blankLink(): AxonQuickLink {
  return { label: '', href: '' };
}

function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || (href.startsWith('/') && !href.startsWith('//'));
}

function prepareLinks(links: AxonQuickLink[]): AxonQuickLink[] {
  return links
    .map((link) => ({
      ...link,
      label: link.label.trim(),
      href: link.href.trim(),
    }))
    .filter((link) => link.label || link.href)
    .slice(0, MAX_QUICK_LINKS);
}

export function AxonQuickLinksSettings() {
  const [links, setLinks] = useState<AxonQuickLink[]>(() => readQuickLinksFromStorage() ?? DEFAULT_QUICK_LINKS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const canAdd = useMemo(() => links.length < MAX_QUICK_LINKS, [links.length]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(apiUrl('/api/axon/quick-links'));
        if (!res.ok) return;
        const data = (await res.json()) as { links?: AxonQuickLink[] };
        const stored = readQuickLinksFromStorage();
        if (!cancelled && (stored?.length || data.links?.length)) {
          setLinks(stored ?? data.links ?? DEFAULT_QUICK_LINKS);
        }
      } catch {
        /* keep localStorage/defaults */
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateLink(index: number, patch: Partial<AxonQuickLink>) {
    setLinks((prev) => prev.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    const next = prepareLinks(links);
    if (next.some((link) => !link.label || !link.href)) {
      setMessage('Each quick link needs a label and URL.');
      return;
    }
    if (next.some((link) => !isSafeHref(link.href))) {
      setMessage('Use http(s) URLs or internal paths that start with /.');
      return;
    }

    setSaving(true);
    setMessage('');
    const stored = writeQuickLinksToStorage(next);
    setLinks(stored);

    try {
      const res = await fetch(apiUrl('/api/axon/quick-links'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: stored }),
      });
      const data = (await res.json()) as { links?: AxonQuickLink[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Cloud sync failed');
      const synced = writeQuickLinksToStorage(data.links ?? stored);
      setLinks(synced);
      setMessage('Quick Links saved.');
    } catch (err) {
      setMessage(
        err instanceof Error
          ? `Saved to this browser. Cloud sync unavailable: ${err.message}`
          : 'Saved to this browser. Cloud sync unavailable.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-axon-blue-glow">Quick Links</h2>
          <p className="mt-1 text-xs text-axon-muted">
            Pin up to {MAX_QUICK_LINKS} shortcuts in the AXON sidebar. Cloud sync uses NI-Brain when available.
          </p>
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => setLinks((prev) => [...prev, blankLink()])}
          className="rounded-lg border border-axon-border px-3 py-2 text-xs text-axon-muted transition hover:border-axon-blue/50 hover:text-axon-cyan disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add Link
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {links.map((link, index) => (
          <div key={`${link.id ?? 'local'}-${index}`} className="grid gap-2 rounded-lg border border-axon-border/60 bg-axon-elevated/30 p-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_auto]">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-axon-muted">Label</span>
              <input
                type="text"
                value={link.label}
                onChange={(e) => updateLink(index, { label: e.target.value })}
                className="mt-1 w-full rounded-lg border border-axon-border bg-axon-surface px-3 py-2 text-sm text-axon-text outline-none transition focus:border-axon-blue-glow/50"
                placeholder="NORTHSiDE Portal"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-axon-muted">URL</span>
              <input
                type="url"
                value={link.href}
                onChange={(e) => updateLink(index, { href: e.target.value })}
                className="mt-1 w-full rounded-lg border border-axon-border bg-axon-surface px-3 py-2 text-sm text-axon-text outline-none transition focus:border-axon-blue-glow/50"
                placeholder="https://northsideintelligence.com"
              />
            </label>
            <button
              type="button"
              onClick={() => removeLink(index)}
              className="self-end rounded-lg border border-axon-border px-3 py-2 text-xs text-axon-muted transition hover:border-red-400/40 hover:text-red-200"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg axon-gradient-btn px-5 py-2 text-sm text-white disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save Quick Links'}
        </button>
        {message && <span className="text-xs text-axon-muted">{message}</span>}
      </div>
    </section>
  );
}
