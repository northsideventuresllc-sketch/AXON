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
 *
 * The pin parsing and the swing timing live in lib/axon-v0/face-signal.mjs so they can be
 * tested offline (tests/face-signal.test.mjs) without React or a browser.
 */
import { useEffect, useState } from 'react';
import { nextSwingDelay, resolveForcedWorking, REST_MS } from '@/lib/axon-v0/face-signal.mjs';

export interface AgentWorkingSignal {
  /** True while agents are (mock) working. */
  working: boolean;
  /** Where the value came from, so the UI can say so plainly. */
  source: 'mock' | 'forced';
}

/** Reads the pin off the live URL. Returns null on the server, where there is no URL. */
function readForced(): boolean | null {
  if (typeof window === 'undefined') return null;
  return resolveForcedWorking(window.location.search);
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
      timer = setTimeout(() => swing(!next), nextSwingDelay(next));
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
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);

    // Safari below 14 only has the deprecated listener pair. Use whichever exists, and
    // always remove the same one on cleanup so the listener is never left attached.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return reduced;
}
