/**
 * Live fleet status — NI-Brain view `v_fleet_live_status` (Supabase project
 * kxijunwgbrlfzvgkhklo). One row per agent with a computed LIVE/STALE/
 * NEVER_SEEN/DISABLED_BY_DESIGN status. Same fail-safe read shape as
 * agent-routines.ts — never throws, resolves to [] on any failure.
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';

export type FleetStatus = 'LIVE' | 'STALE' | 'NEVER_SEEN' | 'DISABLED_BY_DESIGN';

export interface FleetStatusRow {
  agent_name: string;
  surface: string | null;
  last_seen_at: string | null;
  status: FleetStatus;
  last_action: string | null;
  has_live_schedule: boolean | null;
  drift_flag: boolean | null;
  authority_status: string | null;
}

const FIELDS =
  'agent_name,surface,last_seen_at,status,last_action,has_live_schedule,drift_flag,authority_status';

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as { sbSelect: (t: string, f?: string) => Promise<any[]> };
}

/** Every fleet row, ordered by agent name. Never throws. */
export async function listFleetStatus(): Promise<FleetStatusRow[]> {
  try {
    const rows = await sb().sbSelect(
      'v_fleet_live_status',
      `select=${FIELDS}&order=agent_name.asc`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
