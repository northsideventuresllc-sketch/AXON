/**
 * AXON agent dispatch — NI-Brain queue read + fire via Hermes workflow.
 */
import { createClient } from '@supabase/supabase-js';
import { GITHUB_PAT_ENV_HINT, resolveGithubPat } from './github-pat.mjs';

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
  status: string;
  priority: number;
  action_type: string;
  dispatch_phrase: string | null;
  workflow_file: string | null;
  workflow_repo: string | null;
  result_summary: string | null;
  risk_tier: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
  fired_at: string | null;
  completed_at: string | null;
};

export type DispatchComplexity = 'high' | 'medium' | 'low';

const SELECT_FIELDS =
  'id,code,title,owner,manager_chat,repo,status,priority,action_type,dispatch_phrase,workflow_file,workflow_repo,result_summary,risk_tier,source,created_at,updated_at,fired_at,completed_at';

/** Map repo / owner to venture label for filters. */
export function deriveVenture(row: Pick<DispatchRow, 'repo' | 'workflow_repo' | 'owner' | 'code'>): string {
  const blob = `${row.repo || ''} ${row.workflow_repo || ''} ${row.code || ''}`.toLowerCase();
  if (blob.includes('match-fit') || blob.includes('matchfit')) return 'Match Fit';
  if (blob.includes('northside-intelligence') || blob.includes('ni-portal')) return 'NORTHSiDE Portal';
  if (blob.includes('axon')) return 'AXON';
  if (blob.includes('nv-vault') || blob.includes('vault')) return 'nv-vault';
  if (blob.includes('replyflow')) return 'ReplyFlow';
  if (blob.includes('grantbot')) return 'GrantBot';
  return row.owner?.trim() || 'Other';
}

/** Complexity from risk_tier or priority band. */
export function deriveComplexity(row: Pick<DispatchRow, 'risk_tier' | 'priority'>): DispatchComplexity {
  const tier = (row.risk_tier || '').toLowerCase();
  if (['high', 'critical', 'p0', 'p1'].includes(tier)) return 'high';
  if (['medium', 'moderate', 'p2'].includes(tier)) return 'medium';
  if (['low', 'p3', 'routine'].includes(tier)) return 'low';
  if (row.priority <= 3) return 'high';
  if (row.priority <= 6) return 'medium';
  return 'low';
}

export async function fetchDispatchQueue(limit = 100): Promise<DispatchRow[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('agent_dispatch')
    .select(SELECT_FIELDS)
    .in('status', ['queued', 'running', 'fired', 'blocked'])
    .order('priority', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchDispatchTask(code: string): Promise<DispatchRow | null> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('agent_dispatch')
    .select(SELECT_FIELDS)
    .eq('code', code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type DispatchTaskPatch = {
  title?: string;
  dispatch_phrase?: string | null;
};

export async function updateDispatchTask(code: string, patch: DispatchTaskPatch): Promise<DispatchRow> {
  const sb = serviceClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.dispatch_phrase !== undefined) row.dispatch_phrase = patch.dispatch_phrase;

  const { data, error } = await sb
    .from('agent_dispatch')
    .update(row)
    .eq('code', code)
    .select(SELECT_FIELDS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function triggerHermesDispatch(code?: string) {
  const token = await resolveGithubPat();
  if (!token) throw new Error(`GitHub PAT not configured for dispatch fire — ${GITHUB_PAT_ENV_HINT}`);
  const body: { ref: string; inputs?: Record<string, string> } = { ref: 'main' };
  if (code) {
    body.inputs = { fire_only: 'true', seed_only: 'false', code };
  } else {
    body.inputs = { fire_only: 'false', seed_only: 'false' };
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
