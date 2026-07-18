/**
 * AXON agent dispatch — NI-Brain queue read + fire via Hermes workflow.
 * Patch: _AI/axon-patches/dispatch-one-click/
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

export type DispatchRow = {
  id: string;
  code: string;
  title: string;
  owner: string;
  manager_chat: string | null;
  repo: string | null;
  workflow_repo?: string | null;
  status: string;
  priority: number;
  action_type: string;
  dispatch_phrase: string | null;
  workflow_file: string | null;
  result_summary: string | null;
  fired_at: string | null;
};

const DISPATCH_COLUMNS =
  'id,code,title,owner,manager_chat,repo,workflow_repo,status,priority,action_type,dispatch_phrase,workflow_file,result_summary,fired_at';

export async function fetchDispatchQueue(limit = 50): Promise<DispatchRow[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('agent_dispatch')
    .select(DISPATCH_COLUMNS)
    .in('status', ['queued', 'running', 'blocked'])
    .order('priority', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as DispatchRow[];
}

/** Fetch a single dispatch task by its short code. Returns null when missing. */
export async function fetchDispatchTask(code: string): Promise<DispatchRow | null> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('agent_dispatch')
    .select(DISPATCH_COLUMNS)
    .eq('code', code)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as DispatchRow) ?? null;
}

/** Patch a dispatch task's editable fields (title, description) by code. */
export async function updateDispatchTask(
  code: string,
  patch: { title?: string; dispatch_phrase?: string | null },
): Promise<DispatchRow> {
  const sb = serviceClient();
  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.dispatch_phrase !== undefined) fields.dispatch_phrase = patch.dispatch_phrase;
  const { data, error } = await sb
    .from('agent_dispatch')
    .update(fields)
    .eq('code', code)
    .select(DISPATCH_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Task not found');
  return data as unknown as DispatchRow;
}

/** Best-effort venture label from the task code / repo / title. */
export function deriveVenture(
  task: Pick<DispatchRow, 'code' | 'repo' | 'workflow_repo' | 'title'>,
): string {
  const hay = `${task.code ?? ''} ${task.repo ?? ''} ${task.workflow_repo ?? ''} ${task.title ?? ''}`.toLowerCase();
  if (hay.includes('match') || /\bmf\b/.test(hay)) return 'Match Fit';
  if (hay.includes('replyflow') || hay.includes('reply')) return 'ReplyFlow';
  if (hay.includes('vault') || hay.includes('hermes')) return 'NI Vault';
  if (hay.includes('portal')) return 'NI Portal';
  if (hay.includes('axon')) return 'AXON';
  return 'NORTHSiDE';
}

/** Rough complexity heuristic from priority + description length. */
export function deriveComplexity(
  task: Pick<DispatchRow, 'dispatch_phrase' | 'priority'>,
): 'low' | 'medium' | 'high' {
  const len = (task.dispatch_phrase ?? '').length;
  if (task.priority <= 1 || len > 400) return 'high';
  if (len > 150) return 'medium';
  return 'low';
}

export async function triggerHermesDispatch(code?: string) {
  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GH_PAT not configured for dispatch fire');
  const body: { ref: string; inputs?: Record<string, string> } = { ref: 'main' };
  if (code) {
    body.inputs = { fire_only: 'true', seed_only: 'false', code };
  } else {
    // Portal Dispatch All — fire only; scheduled Hermes cron handles seed 3×/day
    body.inputs = { fire_only: 'true', seed_only: 'false' };
  }
  const r = await fetch(
    'https://api.github.com/repos/northsideventuresllc-sketch/nv-vault/actions/workflows/hermes-agent-dispatch.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Hermes dispatch workflow failed: ${r.status} ${err.slice(0, 200)}`);
  }
}
