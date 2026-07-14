import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  LOCAL_MODEL_RUN_TABLE,
  runLocalModelDaily,
} from '@/lib/axon/local-model-daily.mjs';
import {
  fetchOutreachTrainingSignals,
  summarizeOutreachTraining,
} from '@/lib/axon/outreach-learn-core.mjs';
import { SOURCE } from '@/lib/axon/constants.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

async function sbSelect(table: string, filter: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) return [];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!r.ok) throw new Error(`Supabase select ${table}: HTTP ${r.status}`);
  return r.json();
}

async function sbInsert(table: string, row: Record<string, unknown>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY not configured');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Supabase insert ${table}: HTTP ${r.status} ${text}`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

/** Latest local model run + Ollama probe (probe skipped on GET for speed). */
export async function GET() {
  try {
    const sb = serviceClient();
    let last: Record<string, unknown> | null = null;
    if (sb) {
      const { data } = await sb
        .from(LOCAL_MODEL_RUN_TABLE)
        .select('created_at,provider,model_name,summary,avg_score,leads_scored,dry_run,meta')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      last = data;
    }

    const meta = (last?.meta || {}) as { ollama?: { available?: boolean } };

    return NextResponse.json({
      ollamaAvailable: Boolean(meta.ollama?.available),
      provider: last?.provider ?? null,
      model: last?.model_name ?? null,
      lastRunAt: last?.created_at ?? null,
      lastSummary: last?.summary ?? null,
      avgScore: last?.avg_score ?? null,
      leadsScored: last?.leads_scored ?? null,
      dryRun: last?.dry_run ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load local model status' },
      { status: 500 },
    );
  }
}

/** Run daily local model build (heuristic if Ollama unavailable). */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true || process.env.AXON_DRY_RUN === '1';
    const forceHeuristic = body?.forceHeuristic === true;

    let signals: Record<string, unknown>[] = [];
    let leads: Record<string, unknown>[] = [];
    try {
      signals = await fetchOutreachTrainingSignals(sbSelect, { limit: 80, days: 60 });
      leads = await sbSelect(
        'ni_brain_outreach',
        `source=eq.${SOURCE}&select=id,handle,niche,target_group,why_match_fit,comment_draft,dm_draft,notes,status,created_at&order=created_at.desc&limit=40`,
      );
    } catch {
      /* corpus optional for probe/heuristic path */
    }

    const training = summarizeOutreachTraining(signals);
    const result = await runLocalModelDaily({
      signals,
      leads,
      training,
      dryRun: dryRun || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY),
      forceHeuristic,
      persist: async (record: Record<string, unknown>) =>
        sbInsert(LOCAL_MODEL_RUN_TABLE, record),
    });

    return NextResponse.json({
      ok: result.ok,
      dryRun: result.dryRun,
      provider: result.batch.provider,
      model: result.batch.model,
      ollamaAvailable: result.probe.available,
      leadsScored: result.batch.scored.length,
      avgScore: result.batch.avgScore,
      summary: result.summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Local model run failed' },
      { status: 500 },
    );
  }
}
