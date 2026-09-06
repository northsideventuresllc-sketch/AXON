'use client';

/**
 * THE FACE — the home screen's one data poll (Build Plan B, step 2).
 *
 * Reads `GET /api/axon-v0/face/summary` on a flat 15-second cadence and hands the whole
 * screen the same object: the stat cards, the module list and the orb's working signal all
 * come from this one request. A transient failure keeps the last good numbers on screen
 * rather than blanking them.
 *
 * Three things the poll has to get right:
 *  - **Hidden tab** — no request goes out, but `loading` still settles, so a screen mounted
 *    behind another tab is not stuck on "Reading…" when it is first looked at.
 *  - **In flight** — a tick that lands while a request is still out is skipped rather than
 *    stacked, so a slow route cannot pile up overlapping reads.
 *  - **Unmount** — the outstanding request is aborted.
 *
 * `live` is what the micro-bar reads: true → "Signal: live", false → "Signal: demo", which
 * is when the orb falls back to the mock swing in use-agent-working.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { planFaceFetch } from '@/lib/axon-v0/face-summary.mjs';
import type { FaceSummary } from '@/lib/axon-v0/face-reads';

export const FACE_POLL_MS = 15_000;

export interface FaceSummaryState {
  /** Last good summary, or null before the first answer / after a failure with nothing cached. */
  summary: FaceSummary | null;
  /** True until the first request settles — cards show their loading state meanwhile. */
  loading: boolean;
  /** True when the route answered and the numbers on screen are real. */
  live: boolean;
}

export function useFaceSummary(): FaceSummaryState {
  const [summary, setSummary] = useState<FaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const aliveRef = useRef(true);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    aliveRef.current = true;

    async function load() {
      // What this tick should do — decided by a pure function so the awkward cases stay
      // testable offline (lib/axon-v0/face-summary.mjs, tests/face-summary.test.mjs).
      // The one that bites: mounting in a hidden tab must still settle `loading`, or every
      // card sits on "Reading…" until the tab is next looked at.
      const plan = planFaceFetch({ hidden: document.hidden, inFlight: inFlightRef.current });
      if (!plan.fetch) {
        if (plan.settleLoading && aliveRef.current) setLoading(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;
      try {
        const response = await fetch(apiUrl('/api/axon-v0/face/summary'), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (!aliveRef.current) return;
        if (body && typeof body === 'object' && body.summary) {
          setSummary(body.summary as FaceSummary);
          setLive(true);
        } else {
          setLive(false);
        }
      } catch {
        // Keep the last good numbers; only the signal label drops to demo. An abort on
        // unmount lands here too, and aliveRef stops it touching state.
        if (aliveRef.current) setLive(false);
      } finally {
        inFlightRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        if (aliveRef.current) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, FACE_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      aliveRef.current = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  return { summary, loading, live };
}
