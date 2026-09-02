/**
 * Merged agent-comms timeline — NI-Brain view `v_agent_comms_feed` (Supabase
 * project kxijunwgbrlfzvgkhklo). The view already unions agent_bus, the Slack
 * mirror, Telegram messages and the task log into one row shape; this module
 * only adds the fail-safe read wrapper (same shape as agent-routines.ts /
 * store.ts) so a single bad source can never 500 the comms feed.
 */
import { createSupabaseClient } from '@/lib/supabase.mjs';

export type CommsSource = 'bus' | 'slack' | 'telegram' | 'task';

export interface AgentCommsRow {
  source: CommsSource;
  ref: string;
  agent_name: string;
  target: string | null;
  title: string | null;
  body: string | null;
  status: string | null;
  created_at: string;
}

const FIELDS = 'source,ref,agent_name,target,title,body,status,created_at';

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as { sbSelect: (t: string, f?: string) => Promise<any[]> };
}

export interface ListCommsOptions {
  agent?: string;
  since?: string;
  limit?: number;
}

/**
 * Newest-first page of the merged comms feed. Never throws — on any failure
 * (view missing, network, bad key) this resolves to [] so the polling client
 * just sees an empty page rather than an error state.
 */
export async function listAgentComms(opts: ListCommsOptions = {}): Promise<AgentCommsRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const filters = [`select=${FIELDS}`, 'order=created_at.desc', `limit=${limit}`];
  if (opts.agent) filters.push(`agent_name=eq.${encodeURIComponent(opts.agent)}`);
  if (opts.since) filters.push(`created_at=gt.${encodeURIComponent(opts.since)}`);
  try {
    const rows = await sb().sbSelect('v_agent_comms_feed', filters.join('&'));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
