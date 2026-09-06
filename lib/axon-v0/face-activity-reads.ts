/**
 * THE FACE — the server-side reads behind the agent activity trail (Build Plan B, step 4).
 *
 * Same fail-safe shape as lib/axon-v0/face-reads.ts: server-only, the service key never
 * reaches the browser, and every read resolves to `null` on any failure rather than
 * throwing. `null` is what draws the trail's "Not answering" state instead of an empty list
 * that would read as "nothing happened".
 *
 * Tables read, both read-only:
 *   agent_bus           — from_agent, to_agent, subject, created_at (last 30 minutes)
 *   nvg_agent_presence   — agent_name, status, last_seen_at (existing "working now" signal)
 *   agent_dispatch       — the same in-flight fallback face-reads.ts already reads, only
 *                          used here when presence itself could not be read
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { ACTIVITY_WINDOW_MS, shapeFaceActivity } from '@/lib/axon-v0/face-activity.mjs';

function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/** Read a table, or resolve to null if it cannot be read. Never throws. */
async function readOrNull(table: string, filter: string): Promise<Record<string, unknown>[] | null> {
  if (!serviceKey()) return null;
  try {
    const client = createSupabaseClient(serviceKey()) as {
      sbSelect: (t: string, f?: string) => Promise<unknown[]>;
    };
    const rows = await client.sbSelect(table, filter);
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

export interface FaceActivityItem {
  at: string | null;
  from: string;
  to: string | null;
  subject: string;
  kind: string;
  verb: string;
  relative: string | null;
  fresh: boolean;
}

export interface FacePresenceItem {
  agent: string;
  status: string | null;
  lastSeenAt: string | null;
}

export interface FaceActivity {
  generatedAt: string;
  trail: { items: FaceActivityItem[]; readable: boolean };
  presence: { items: FacePresenceItem[]; readable: boolean };
  /** Presence heartbeat within 10 min OR a bus row within 2 min. Null only when unreadable. */
  workingNow: boolean | null;
}

/**
 * One object for the agent activity trail. Reads the bus, presence and (as a fallback)
 * the dispatch queue in parallel; a source that fails only darkens its own part of the
 * shape, exactly like lib/axon-v0/face-reads.ts.
 */
export async function loadFaceActivity(): Promise<FaceActivity> {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_MS).toISOString();

  const [busRows, presenceRows, dispatchRows] = await Promise.all([
    readOrNull(
      'agent_bus',
      `created_at=gte.${since}&select=from_agent,to_agent,subject,created_at&order=created_at.desc&limit=100`
    ),
    readOrNull('nvg_agent_presence', 'select=agent_name,status,last_seen_at'),
    // Only reached as the working-signal fallback when presence itself is unreadable —
    // same rows face-reads.ts already asks for.
    readOrNull(
      'agent_dispatch',
      'status=in.(running,in_progress,claimed,dispatched)&select=status,updated_at,fired_at,claimed_at&order=updated_at.desc&limit=500'
    ),
  ]);

  return shapeFaceActivity({
    busRows,
    presenceRows,
    dispatchRows,
    nowMs: Date.now(),
  }) as FaceActivity;
}
