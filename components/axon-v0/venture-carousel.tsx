'use client';

import './carousel.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import { loadPrefs, patchPrefs, toTitleCase } from '@/lib/axon-v0/view-prefs';
import type { Venture, VentureAgent, VentureTool } from '@/lib/axon-v0/types';

type VentureCard = Venture & { agents: VentureAgent[]; tools: VentureTool[] };

/** Short holographic monogram derived from the venture name. */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable ordering: ids present in `order` come first (in that order), the rest
 *  keep their API order after. */
function applyOrder(list: VentureCard[], order: string[]): VentureCard[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

export function VentureCarousel() {
  const router = useRouter();

  const [ventures, setVentures] = useState<VentureCard[]>([]);
  const [error, setError] = useState('');

  /** A sub-venture shows whose it is, so it never reads as an independent company. */
  const parentName = (parentId: string) => ventures.find((v) => v.id === parentId)?.name;

  // per-viewer prefs (localStorage only — never the DB)
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);

  // carousel runtime
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [reduced, setReduced] = useState(false);

  // UI toggles
  const [manageOpen, setManageOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');

  // ---- data load ----
  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/axon-v0/ventures'));
      const data = await r.json();
      if (r.ok) setVentures(data.ventures || []);
      else setError(data.error || 'Failed to load ventures');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ventures');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // load per-viewer prefs once on mount (guarded inside view-prefs)
  useEffect(() => {
    const p = loadPrefs();
    setOrder(p.ventureOrder);
    setHidden(p.ventureHidden);
  }, []);

  // respect reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  // full ordered list (incl. hidden) for the manage popover + see-all
  const orderedAll = useMemo(() => applyOrder(ventures, order), [ventures, order]);
  // visible carousel items
  const visible = useMemo(
    () => orderedAll.filter((v) => !hidden.includes(v.id)),
    [orderedAll, hidden],
  );

  // keep active index in range whenever the visible set changes
  useEffect(() => {
    setActive((a) => (visible.length ? ((a % visible.length) + visible.length) % visible.length : 0));
  }, [visible.length]);

  // slow auto-rotation — paused on hover / reduced-motion / single item
  const paused = hovering || reduced || visible.length < 2;
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % visible.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [paused, visible.length]);

  const step = useCallback(
    (dir: number) => {
      setActive((a) => {
        const n = visible.length;
        if (!n) return 0;
        return ((a + dir) % n + n) % n;
      });
    },
    [visible.length],
  );

  // relative ring position of item i vs the active (front) index
  const posOf = useCallback(
    (i: number): 'center' | 'left' | 'right' | 'back' => {
      const n = visible.length;
      let rel = ((i - active) % n + n) % n; // 0..n-1
      if (rel > n / 2) rel -= n; // shortest signed distance
      if (rel === 0) return 'center';
      if (rel === 1) return 'right';
      if (rel === -1) return 'left';
      return 'back';
    },
    [active, visible.length],
  );

  // ---- prefs mutations (persist to localStorage via patchPrefs) ----
  function persist(nextOrder: string[], nextHidden: string[]) {
    setOrder(nextOrder);
    setHidden(nextHidden);
    patchPrefs({ ventureOrder: nextOrder, ventureHidden: nextHidden });
  }

  function move(id: string, dir: -1 | 1) {
    const ids = orderedAll.map((v) => v.id);
    const idx = ids.indexOf(id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    persist(ids, hidden);
  }

  function toggleHide(id: string) {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    persist(order.length ? order : orderedAll.map((v) => v.id), next);
  }

  // ---- create venture (unchanged POST) ----
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

  const centered = visible[active];

  return (
    <section className="vc-section">
      {error && <p className="mb-2 text-xs text-rose-300">{error}</p>}

      {visible.length === 0 ? (
        <div className="vc-empty">
          {ventures.length === 0 ? 'No ventures yet — create one below.' : 'All ventures hidden — manage to restore.'}
        </div>
      ) : (
        <div
          className="vc-stage"
          data-hover={hovering ? 'true' : 'false'}
          aria-roledescription="carousel"
        >
          {visible.length > 1 && (
            <>
              <button className="vc-arrow vc-arrow-left" onClick={() => step(-1)} aria-label="Previous venture">
                ‹
              </button>
              <button className="vc-arrow vc-arrow-right" onClick={() => step(1)} aria-label="Next venture">
                ›
              </button>
            </>
          )}

          <div className="vc-ring">
            {visible.map((v, i) => {
              const pos = posOf(i);
              const isCenter = pos === 'center';
              return (
                <div
                  key={v.id}
                  className="vc-item"
                  data-pos={pos}
                  style={{ ['--vc-accent' as string]: v.accent }}
                  onMouseEnter={isCenter ? () => setHovering(true) : undefined}
                  onMouseLeave={isCenter ? () => setHovering(false) : undefined}
                  onClick={() => {
                    if (isCenter) router.push(`/v/${v.id}`);
                    else if (pos === 'right') step(1);
                    else if (pos === 'left') step(-1);
                  }}
                  role="button"
                  tabIndex={isCenter ? 0 : -1}
                  aria-label={isCenter ? `Open ${v.name}` : v.name}
                  onKeyDown={(e) => {
                    if (isCenter && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      router.push(`/v/${v.id}`);
                    }
                  }}
                >
                  <div className="vc-icon">
                    <span className="vc-glyph">{monogram(v.name)}</span>
                    <span className="vc-glyph-sub">
                      {v.parent_id ? 'Part of ' + (parentName(v.parent_id) ?? 'a venture') : 'Venture'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Hover caption for the focused venture — never clips (stage has room) */}
          {centered && (
            <div className="vc-caption" aria-hidden={!hovering}>
              <div className="vc-title">{centered.name.toUpperCase()}</div>
              {centered.parent_id && (
                <div className="vc-parent">Part of {parentName(centered.parent_id) ?? 'a venture'}</div>
              )}
              {centered.tagline && <div className="vc-subtitle">{toTitleCase(centered.tagline)}</div>}
              <div className="vc-counts">
                <span>{centered.agents.length} agents</span>
                <span className="vc-dot">·</span>
                <span>{centered.tools.length} tools</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Title + controls (below the carousel) ---- */}
      <p className="vc-label">VENTURES</p>

      <div className="vc-footer">
        <button className="vc-link" onClick={() => setAdding(true)}>
          NEW VENTURE
        </button>

        <button className="vc-link" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'HIDE LIST' : 'ALL VENTURES'}
        </button>

        <div className="vc-manage-wrap">
          <button className="vc-link" onClick={() => setManageOpen((o) => !o)}>
            {manageOpen ? '✕ CLOSE' : 'MANAGE VENTURES'}
          </button>
          {manageOpen && (
            <div className="vc-popover v0-scroll">
              {orderedAll.length === 0 && <p className="vc-prow-name">No ventures yet.</p>}
              {orderedAll.map((v, i) => {
                const isHidden = hidden.includes(v.id);
                return (
                  <div className="vc-prow" key={v.id}>
                    <span className={`vc-prow-name${isHidden ? ' vc-is-hidden' : ''}`}>{v.name}</span>
                    <button
                      className="vc-mini"
                      onClick={() => move(v.id, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${v.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      className="vc-mini"
                      onClick={() => move(v.id, 1)}
                      disabled={i === orderedAll.length - 1}
                      aria-label={`Move ${v.name} down`}
                    >
                      ↓
                    </button>
                    <button
                      className="vc-mini"
                      onClick={() => toggleHide(v.id)}
                      aria-label={isHidden ? `Show ${v.name}` : `Hide ${v.name}`}
                    >
                      {isHidden ? '🙈' : '👁'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showAll && (
        <div className="vc-all v0-rise">
          {orderedAll.map((v) => (
            <Link key={v.id} href={`/v/${v.id}`} className="vc-all-item">
              <span className="vc-all-swatch" style={{ color: v.accent, background: v.accent }} />
              <span className="vc-all-name">
                {v.name}
                {hidden.includes(v.id) && <span className="vc-tag">hidden</span>}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ---- New venture create form (opens below the controls row) ---- */}
      {adding && (
        <div className="vc-create mt-4">
          <form onSubmit={create} className="v0-panel max-w-md space-y-2 p-4">
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
              <button type="submit" className="v0-chip bg-cyan-400/15 text-cyan-100">
                Create
              </button>
              <button type="button" onClick={() => setAdding(false)} className="v0-chip text-slate-400">
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-slate-500">5 default agents auto-built</p>
          </form>
        </div>
      )}
    </section>
  );
}
