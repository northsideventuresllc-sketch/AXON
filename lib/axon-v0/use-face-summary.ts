'use client';

/**
 * THE FACE — the home screen's one data poll (Build Plan B, step 2).
 *
 * Reads `GET /api/axon-v0/face/summary` every 15 seconds and hands the whole screen the
 * same object: the stat cards, the module list and the orb's working signal all come from
 * this one request. Polling pauses while the tab is hidden, and a transient failure keeps
 * the last good numbers on screen rather than blanking them.
 *
 * `live` is what the micro-bar reads: true → "Signal: live", false → "Signal: demo", which
 * is when the orb falls back to the mock swing in use-agent-working.ts.
 */
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
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

  useEffect(() => {
    aliveRef.current = true;

    async function load() {
      if (document.hidden) return;
      try {
        const response = await fetch(apiUrl('/api/axon-v0/face/summary'));
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
        // Keep the last good numbers; only the signal label drops to demo.
        if (aliveRef.current) setLive(false);
      } finally {
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
    };
  }, []);

  return { summary, loading, live };
}
