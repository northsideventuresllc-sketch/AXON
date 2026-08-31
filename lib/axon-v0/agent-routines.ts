/**
 * Fleet-wide agent roster — NI-Brain `nvg_agent_routines` (Supabase project
 * kxijunwgbrlfzvgkhklo). Unlike `axon_venture_agents` (AXON's own account-scoped
 * agents, see lib/axon-v0/store.ts), this table is not scoped to a venture or an
 * AXON account: it holds every agent in the fleet, including Claude Code cloud
 * agents (`platform='claude_code_cloud'`) and the Cowork ones being migrated
 * (`platform='cowork_ccr'`). Nothing in the AXON v0 harness writes to this table —
 * read-only here, same fail-safe shape as the rest of lib/axon-v0/store.ts.
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';

export interface AgentRoutineRow {
  agent_name: string;
  routine_id: string;
  active: boolean;
  wake_type: string | null;
  wake_config: Record<string, unknown> | null;
  function_summary: string | null;
  platform: string | null;
  health_status: string | null;
  health_note: string | null;
  last_fired_at: string | null;
  last_health_check_at: string | null;
  updated_at: string | null;
}

const FIELDS =
  'agent_name,routine_id,active,wake_type,wake_config,function_summary,platform,health_status,health_note,last_fired_at,last_health_check_at,updated_at';

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as { sbSelect: (t: string, f?: string) => Promise<any[]> };
}

/**
 * Every routine row, fleet-wide. Never throws — on any failure (table missing,
 * network, bad key) this resolves to [] so a single bad source can never blank
 * the AGENTS board; callers still get AXON's own agents.
 */
export async function listAgentRoutines(): Promise<AgentRoutineRow[]> {
  try {
    const rows = await sb().sbSelect(
      'nvg_agent_routines',
      `select=${FIELDS}&order=platform.asc,agent_name.asc`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
