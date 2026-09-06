'use client';

/**
 * THE FACE — the agent activity trail's poll (Build Plan B, step 4).
 *
 * Reads `GET /api/axon-v0/face/activity` on the same flat 15-second cadence as
 * use-face-summary.ts, and the same three things have to be got right here too:
 *  - **Hidden tab** — no request goes out, but `loading` still settles.
 *  - **In flight** — a tick that lands while a request is still out is skipped.
 *  - **Unmount** — the outstanding request is aborted.
 *
 * One thing this hook adds on top of use-face-summary.ts: `burstToken`. It bumps by one
 * every time a bus row arrives that was not in the previous poll's trail — the hero passes
 * that straight to the orb scene to trigger one visible burst.
 *
 * The decision of whether a poll counts as "new traffic" is NOT "did the newest timestamp
 * change" — the previously-newest row can age out of the 30-minute window between polls,
 * leaving an older, already-seen row as `items[0]` with a different (older) timestamp and
 * no new traffic at all. That comparison lives as a pure function,
 * `shouldBurst` in lib/axon-v0/face-activity.mjs, so it is testable offline
 * (tests/face-activity.test.mjs) without a DOM or a timer.
 */
import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { planFaceFetch } from '@/lib/axon-v0/face-summary.mjs';
import { shouldBurst, trailItemIdentity } from '@/lib/axon-v0/face-activity.mjs';
import type { FaceActivity } from '@/lib/axon-v0/face-activity-reads';

export const FACE_ACTIVITY_POLL_MS = 15_000;

export interface FaceActivityState {
  /** Last good read, or null before the first answer / after a failure with nothing cached. */
  activity: FaceActivity | null;
  /** True until the first request settles. */
  loading: boolean;
  /** True when the route answered. */
  live: boolean;
  /** Bumps by one whenever a new bus row appears since the previous poll. */
  burstToken: number;
}

export function useFaceActivity(): FaceActivityState {
  const [activity, setActivity] = useState<FaceActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [burstToken, setBurstToken] = useState(0);
  const aliveRef = useRef(true);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** The previous poll's newest row — ms since epoch plus an identity, for shouldBurst. */
  const prevNewestRef = useRef<{ ms: number | null; identity: string | null }>({
    ms: null,
    identity: null,
  });
  /** True once the first poll has landed — shouldBurst never fires on that first answer. */
  const firstPollDoneRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;

    async function load() {
      const plan = planFaceFetch({ hidden: document.hidden, inFlight: inFlightRef.current });
      if (!plan.fetch) {
        if (plan.settleLoading && aliveRef.current) setLoading(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;
      try {
        const response = await fetch(apiUrl('/api/axon-v0/face/activity'), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (!aliveRef.current) return;
        if (body && typeof body === 'object' && body.activity) {
          const next = body.activity as FaceActivity;
          setActivity(next);
          setLive(true);

          const newestItem = next.trail?.items?.[0] ?? null;
          const nextNewestMs = newestItem?.at ? Date.parse(newestItem.at) : NaN;
          const nextNewestMsOrNull = Number.isFinite(nextNewestMs) ? nextNewestMs : null;
          const nextIdentity = newestItem ? trailItemIdentity(newestItem) : null;

          if (
            shouldBurst({
              prevNewestMs: prevNewestRef.current.ms,
              prevIdentity: prevNewestRef.current.identity,
              nextNewestMs: nextNewestMsOrNull,
              nextIdentity,
              isFirstPoll: !firstPollDoneRef.current,
            })
          ) {
            setBurstToken((n) => n + 1);
          }
          prevNewestRef.current = { ms: nextNewestMsOrNull, identity: nextIdentity };
          firstPollDoneRef.current = true;
        } else {
          setLive(false);
        }
      } catch {
        // Keep the last good trail; only the signal drops to demo. An abort on unmount
        // lands here too, and aliveRef stops it touching state.
        if (aliveRef.current) setLive(false);
      } finally {
        inFlightRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        if (aliveRef.current) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, FACE_ACTIVITY_POLL_MS);
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

  return { activity, loading, live, burstToken };
}
