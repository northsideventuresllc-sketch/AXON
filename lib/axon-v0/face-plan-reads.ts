/**
 * THE FACE — the server-side reads behind the two voice panels (Build Plan B, step 3).
 *
 * Same fail-safe shape as lib/axon-v0/face-reads.ts: server-only, the service key never
 * reaches the browser, and every read resolves to `null` on any failure rather than
 * throwing. `null` is what draws the written "not answering" state instead of an empty list
 * that would read as "nothing to do".
 *
 * Both reads are READ-ONLY. Voice in step 3 shows and reads back; it never sends, posts,
 * spends or fires.
 *
 * Where today's plan comes from: **EXEC's own daily post on the agent bus.** The Executive
 * agent writes one row a night to `agent_bus` addressed to everyone, subject
 * `AXON-EXEC-AGENT-NIGHTLY-<date>`, with a JSON body carrying a written
 * `plain_english_summary` — one bullet per line, in EXEC's words. That is the plan the
 * panel shows. If there is no post for today, the EXEC session note for the same date is
 * used instead, and if there is neither the panel says "No plan posted yet today". Nothing
 * is ever written by this screen.
 *
 * Tables read, both read-only:
 *   agent_bus       — EXEC's daily post (from_agent like 'AXON Executive%')
 *   session_notes_apartment — EXEC's own session note, the fallback
 *   agent_dispatch  — the queue, for anything waiting on JB
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { shapeDayPlan, shapeNeedsMe } from '@/lib/axon-v0/face-commands.mjs';

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

export interface FaceDayPlan {
  /** Which source answered: EXEC's daily post, EXEC's session note, or neither. */
  source: 'exec-post' | 'exec-note' | 'none';
  /** The date the plan is for, as stored. */
  date: string | null;
  /** EXEC's own lines, unedited. */
  items: string[];
  /** False when the sources could not be read at all — a different thing from "not posted yet". */
  readable: boolean;
}

export interface FaceNeedsMeItem {
  what: string;
  owner: string | null;
}

export interface FaceNeedsMe {
  items: FaceNeedsMeItem[];
  readable: boolean;
}

/** Today, as EXEC stamps its own post: a plain YYYY-MM-DD in UTC. */
export function todayIso(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Today's plan, from EXEC's own words. Never a plan this screen made up. */
export async function loadDayPlan(): Promise<FaceDayPlan> {
  const [busRows, noteRows] = await Promise.all([
    readOrNull(
      'agent_bus',
      'from_agent=ilike.*executive*&select=subject,body,created_at&order=created_at.desc&limit=10'
    ),
    readOrNull(
      'session_notes_apartment',
      'workspace_type=ilike.*exec*&select=session_date,raw_note,created_at&order=created_at.desc&limit=10'
    ),
  ]);

  return shapeDayPlan({ busRows, noteRows, todayIso: todayIso() }) as FaceDayPlan;
}

/** Everything in the queue that is waiting on JB. Read-only; nothing is approved here. */
export async function loadNeedsMe(): Promise<FaceNeedsMe> {
  const rows = await readOrNull(
    'agent_dispatch',
    'status=not.in.(done,rejected,skipped)&select=title,owner,status,needs_jb_approval,created_at&order=created_at.desc&limit=200'
  );

  return shapeNeedsMe(rows) as FaceNeedsMe;
}
