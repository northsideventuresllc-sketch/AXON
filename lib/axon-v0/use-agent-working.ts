'use client';

/**
 * THE FACE — the orb's "agents working" signal.
 *
 * Step 2 wired the real one: the home screen polls `GET /api/axon-v0/face/summary` every
 * 15 seconds (lib/axon-v0/use-face-summary.ts) and passes the live count in here. A count
 * above zero beats the orb. The mock timer below is now only a fallback — it runs when the
 * route errors or has not answered yet, so the orb never sits dead behind a failed read.
 *
 * Step 4 of Build Plan B adds a second live source alongside the summary count: the agent
 * activity feed's own working signal (a presence heartbeat within ten minutes OR a bus row
 * within the last two — lib/axon-v0/face-activity.mjs, `resolveActivityWorking`). Either
 * source saying "working" is enough; the hook shape otherwise does not change.
 *
 * The URL still wins over everything: `?working=1` pins it working, `?working=0` pins it resting.
 * Read straight off `window.location` rather than through the router hook so the page needs
 * no Suspense boundary and still renders identically on the server.
 *
 * The pin parsing and the swing timing live in lib/axon-v0/face-signal.mjs so they can be
 * tested offline (tests/face-signal.test.mjs) without React or a browser.
 */
import { useEffect, useState } from 'react';
import { nextSwingDelay, resolveForcedWorking, REST_MS } from '@/lib/axon-v0/face-signal.mjs';

export interface AgentWorkingSignal {
  /** True while agents are working. */
  working: boolean;
  /** Where the value came from, so the UI can say so plainly. */
  source: 'mock' | 'forced' | 'live';
}

/** What the live poll knows, when it knows anything. */
export interface LiveWorkingInput {
  /** True when the summary route answered. */
  live: boolean;
  /** Agents working right now, or null when that source could not be read. */
  count: number | null;
  /**
   * Step 4: the activity feed's own independent working signal — a presence heartbeat
   * within ten minutes OR a bus row within the last two. `null` when that feed itself has
   * not answered, which is different from "answered and says nothing is running" (`false`).
   * Either this or `count` saying working is enough to beat the orb.
   */
  activityWorking?: boolean | null;
}

/** Reads the pin off the live URL. Returns null on the server, where there is no URL. */
function readForced(): boolean | null {
  if (typeof window === 'undefined') return null;
  return resolveForcedWorking(window.location.search);
}

export function useAgentWorkingSignal(input?: LiveWorkingInput): AgentWorkingSignal {
  const [working, setWorking] = useState(false);
  const [forced, setForced] = useState<boolean | null>(null);

  // The live count is only usable when the route answered AND that particular source was
  // readable. `live` with a null count means the route is up but presence is not — that is
  // still a real answer of "nothing is running", not a reason to start the mock.
  const summaryWorking = input?.live ? (input.count ?? 0) > 0 : null;
  // Step 4's independent signal: null means that feed has not answered, not "not working".
  const activityWorking = input?.activityWorking ?? null;
  // Either live source saying "working" is enough. Only fall back to the mock swing when
  // NEITHER source has answered at all — one real "nothing running" answer beats silence.
  const liveWorking =
    summaryWorking === null && activityWorking === null
      ? null
      : summaryWorking === true || activityWorking === true;
  const useMock = liveWorking === null;

  useEffect(() => {
    const pinned = readForced();
    setForced(pinned);
    if (pinned !== null) {
      setWorking(pinned);
      return;
    }
    if (!useMock) return;

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
  }, [useMock]);

  if (forced !== null) return { working: forced, source: 'forced' };
  if (liveWorking !== null) return { working: liveWorking, source: 'live' };
  return { working, source: 'mock' };
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
