/**
 * B6 — Dash To-Do page data source. JB's rolling to-do list lives in NI-Brain
 * (Supabase project kxijunwgbrlfzvgkhklo), not in AXON's own account-scoped tables:
 * `nvg_rolling_tasks` (Repeating + Non-repeating rows) and `agent_dispatch` (the
 * NV Job Code / dispatch Queue). Read-only here, same fail-safe shape as
 * lib/axon-v0/agent-routines.ts — a bad source resolves to [] rather than breaking
 * the page.
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';

export interface RollingTaskRow {
  id: string;
  task_type: string;
  cadence: string | null;
  day_of_week: number | null;
  day_of_month: number | null;
  venture: string;
  description: string;
  status: string;
  done: boolean;
  completed_at: string | null;
}

export interface DispatchQueueRow {
  code: string;
  title: string | null;
  dispatch_phrase: string | null;
  status: string;
  updated_at: string | null;
}

const TASK_FIELDS =
  'id,task_type,cadence,day_of_week,day_of_month,venture,description,status,done,completed_at';
const QUEUE_FIELDS = 'code,title,dispatch_phrase,status,updated_at';

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as { sbSelect: (t: string, f?: string) => Promise<any[]> };
}

/** Every `nvg_rolling_tasks` row that isn't an `agentic_question` (out of scope for
 *  the LOCKED Repeating/Non-repeating table format). Never throws. */
export async function listRollingTasks(): Promise<RollingTaskRow[]> {
  try {
    const rows = await sb().sbSelect(
      'nvg_rolling_tasks',
      `task_type=neq.agentic_question&select=${TASK_FIELDS}&order=created_at.asc`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Recent `agent_dispatch` rows for the Queue table — open work plus recently-done,
 *  newest first. Never throws. */
export async function listQueueRows(limit = 30): Promise<DispatchQueueRow[]> {
  try {
    const rows = await sb().sbSelect(
      'agent_dispatch',
      `select=${QUEUE_FIELDS}&order=updated_at.desc&limit=${Math.max(1, Math.min(200, limit))}`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
