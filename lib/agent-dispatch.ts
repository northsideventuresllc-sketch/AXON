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
  status: string;
  priority: number;
  action_type: string;
  dispatch_phrase: string | null;
  workflow_file: string | null;
  result_summary: string | null;
  fired_at: string | null;
};

export async function fetchDispatchQueue(limit = 50): Promise<DispatchRow[]> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('agent_dispatch')
    .select(
      'id,code,title,owner,manager_chat,repo,status,priority,action_type,dispatch_phrase,workflow_file,result_summary,fired_at',
    )
    .in('status', ['queued', 'running', 'fired', 'blocked'])
    .order('priority', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function triggerHermesDispatch(code?: string) {
  const token = process.env.GH_PAT || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GH_PAT not configured for dispatch fire');
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
