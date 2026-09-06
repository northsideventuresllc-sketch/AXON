/**
 * THE FACE — the server-side reads behind the home screen's one summary route.
 *
 * Same fail-safe shape as the rest of lib/axon-v0: server-only, the service key never
 * reaches the browser, and every read resolves to `null` on any failure rather than
 * throwing. `null` matters — the shaping layer (lib/axon-v0/face-summary.mjs) turns a null
 * source into a designed "No data yet" card instead of a zero that would read as a fact.
 *
 * Tables read, all read-only:
 *   nvg_agent_routines  — the roster: agents live vs planned, and the module list
 *   nvg_agent_presence  — heartbeats, which drive "agents working now" and the orb pulse
 *   agent_dispatch      — the ticket queue
 *   ni_brain_outreach   — outreach leads (source = axon_ni_services), same table lib/leads.ts reads
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { SOURCE, SUPABASE_URL } from '@/lib/constants.mjs';
import { LEADS_WINDOW_MS, parseExactCount, shapeFaceSummary } from '@/lib/axon-v0/face-summary.mjs';

function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function sb() {
  return createSupabaseClient(serviceKey()) as {
    sbSelect: (t: string, f?: string) => Promise<unknown[]>;
  };
}

/**
 * Exact number of rows matching a filter, without pulling the rows.
 *
 * `Prefer: count=exact` plus `Range: 0-0` asks PostgREST for the head count and one row;
 * the total comes back in `Content-Range` (`0-0/183`). This exists because counting a
 * capped page of rows silently undercounts the moment the queue grows past that page — an
 * "Open tickets" number that quietly stops climbing is worse than no number at all.
 *
 * Returns null on any failure, which the card draws as its empty state.
 */
async function countRows(table: string, filter: string): Promise<number | null> {
  const key = serviceKey();
  if (!key) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    if (!response.ok && response.status !== 206) return null;
    return parseExactCount(response.headers.get('content-range')) as number | null;
  } catch {
    return null;
  }
}

/** Read a table, or resolve to null if it cannot be read. Never throws. */
async function readOrNull(table: string, filter: string): Promise<Record<string, unknown>[] | null> {
  try {
    const rows = await sb().sbSelect(table, filter);
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

export interface FaceModule {
  name: string;
  summary: string | null;
  health: 'On track' | 'Quiet' | 'Needs attention' | 'Off';
  live: boolean;
}

export interface FaceSummary {
  generatedAt: string;
  agentsLive: number | null;
  agentsWorking: number | null;
  workingSource: 'presence' | 'tickets' | 'none';
  openTickets: number | null;
  leadsThisWeek: number | null;
  revenue: null;
  modules: {
    live: FaceModule[];
    planned: FaceModule[];
    total: number;
    readable: boolean;
  };
}

/**
 * One object for the whole home screen. Reads all four sources in parallel; a source that
 * fails is simply null and only darkens its own card.
 */
export async function loadFaceSummary(): Promise<FaceSummary> {
  const since = new Date(Date.now() - LEADS_WINDOW_MS).toISOString();

  const [rosterRows, presenceRows, dispatchRows, openTicketsCount, leadRows] = await Promise.all([
    readOrNull(
      'nvg_agent_routines',
      'select=agent_name,function_summary,active,health_status,retired_at&order=agent_name.asc'
    ),
    readOrNull('nvg_agent_presence', 'select=agent_name,status,last_seen_at'),
    // Only the in-flight rows, and only as the fallback working signal when presence is
    // unreadable. The open-ticket number never comes from this page — it is counted exactly
    // by the call below.
    readOrNull(
      'agent_dispatch',
      'status=in.(running,in_progress,claimed,dispatched)&select=status,updated_at,fired_at,claimed_at&order=updated_at.desc&limit=500'
    ),
    countRows('agent_dispatch', 'status=not.in.(done,rejected,skipped)&select=status'),
    readOrNull(
      'ni_brain_outreach',
      `source=eq.${SOURCE}&created_at=gte.${since}&select=created_at&limit=2000`
    ),
  ]);

  return shapeFaceSummary({
    rosterRows,
    presenceRows,
    dispatchRows,
    openTicketsCount,
    leadRows,
    nowMs: Date.now(),
  }) as FaceSummary;
}
