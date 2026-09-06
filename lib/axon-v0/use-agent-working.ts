'use client';

/**
 * THE FACE — mock "agents working" signal (step 1 only).
 *
 * Step 4 of Build Plan B replaces the timer below with the real agent traffic feed
 * (`GET /api/axon-v0/comms-feed` → NI-Brain view `v_agent_comms_feed`): any row inside the
 * last 90 seconds counts as work in progress. Until then the orb swings on its own so the
 * resting and working looks can both be judged without waiting for a real agent to run.
 *
 * The URL wins over the timer: `?working=1` pins it working, `?working=0` pins it resting.
 * Read straight off `window.location` rather than through the router hook so the page needs
 * no Suspense boundary and still renders identically on the server.
 */
import { useEffect, useState } from 'react';

/** Milliseconds the mock signal stays resting, then working, before repeating. */
const REST_MS = 5200;
const WORK_MS = 4200;

export interface AgentWorkingSignal {
  /** True while agents are (mock) working. */
  working: boolean;
  /** Where the value came from, so the UI can say so plainly. */
  source: 'mock' | 'forced';
}

function readForced(): boolean | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('working');
  if (raw === null) return null;
  return raw !== '0' && raw !== 'false';
}

export function useAgentWorkingSignal(): AgentWorkingSignal {
  const [working, setWorking] = useState(false);
  const [forced, setForced] = useState<boolean | null>(null);

  useEffect(() => {
    const pinned = readForced();
    setForced(pinned);
    if (pinned !== null) {
      setWorking(pinned);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const swing = (next: boolean) => {
      if (cancelled) return;
      setWorking(next);
      timer = setTimeout(() => swing(!next), next ? WORK_MS : REST_MS);
    };

    timer = setTimeout(() => swing(true), REST_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { working, source: forced === null ? 'mock' : 'forced' };
}

/** True when the viewer has asked for reduced motion. Re-reads on preference change. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
