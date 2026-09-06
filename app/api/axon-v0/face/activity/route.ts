import { NextResponse } from 'next/server';
import { loadFaceActivity } from '@/lib/axon-v0/face-activity-reads';
import { shapeFaceActivity } from '@/lib/axon-v0/face-activity.mjs';

/**
 * THE FACE — the agent activity trail (Build Plan B, step 4).
 *
 * Reads the last 30 minutes of `agent_bus` traffic plus the roster's presence heartbeats
 * and returns one JSON object: the trail (newest first, plain-English verbs, never raw
 * subjects/ids/codes) and the combined "agents working" signal — a presence heartbeat
 * within ten minutes OR a bus row within the last two, per docs/the-face/SPEC.md §4.3.
 *
 * Behind the dashboard session gate like every other route in this app (middleware.ts has
 * no allowlist entry for it). Polled on the same 15-second cadence as the summary route —
 * see lib/axon-v0/use-face-activity.ts.
 *
 * Same 200-always contract as the rest of THE FACE: a source that failed comes back with
 * `readable: false` on its own slice of the shape, and the whole route still answers.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, activity: await loadFaceActivity() });
  } catch {
    return NextResponse.json({ ok: true, activity: shapeFaceActivity() });
  }
}
