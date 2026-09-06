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
import { SOURCE } from '@/lib/constants.mjs';
import { LEADS_WINDOW_MS, shapeFaceSummary } from '@/lib/axon-v0/face-summary.mjs';

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as { sbSelect: (t: string, f?: string) => Promise<unknown[]> };
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

  const [rosterRows, presenceRows, dispatchRows, leadRows] = await Promise.all([
    readOrNull(
      'nvg_agent_routines',
      'select=agent_name,function_summary,active,health_status,retired_at&order=agent_name.asc'
    ),
    readOrNull('nvg_agent_presence', 'select=agent_name,status,last_seen_at'),
    readOrNull(
      'agent_dispatch',
      'select=status,updated_at,fired_at,claimed_at&order=updated_at.desc&limit=2000'
    ),
    readOrNull(
      'ni_brain_outreach',
      `source=eq.${SOURCE}&created_at=gte.${since}&select=created_at&limit=2000`
    ),
  ]);

  return shapeFaceSummary({
    rosterRows,
    presenceRows,
    dispatchRows,
    leadRows,
    nowMs: Date.now(),
  }) as FaceSummary;
}
