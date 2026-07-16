import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  WISDOM_ITEMS_TABLE,
  WISDOM_RUNS_TABLE,
  runWisdomAbsorbLoop,
} from '@/lib/wisdom-absorb-loop.mjs';
import {
  getJspaceState,
  saveJspaceState,
} from '@/lib/axon-j-space-core.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
}

function serviceClient() {
  const key = serviceKey();
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

async function sbSelect(table: string, filter: string) {
  const key = serviceKey();
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
  const key = serviceKey();
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

async function sbPatch(table: string, filter: string, row: Record<string, unknown>) {
  const key = serviceKey();
  if (!key) throw new Error('SUPABASE_SERVICE_KEY not configured');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
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
    throw new Error(`Supabase patch ${table}: HTTP ${r.status} ${text}`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

async function upsertWisdomItems(rows: Record<string, unknown>[]) {
  const out = [];
  for (const row of rows) {
    const existing = await sbSelect(
      WISDOM_ITEMS_TABLE,
      `operator_id=eq.${encodeURIComponent(String(row.operator_id))}&fingerprint=eq.${encodeURIComponent(String(row.fingerprint))}&select=id,salience&limit=1`,
    );
    if (existing?.length) {
      const prev = existing[0] as { id: string; salience: number };
      out.push(
        await sbPatch(WISDOM_ITEMS_TABLE, `id=eq.${prev.id}`, {
          ...row,
          salience: Math.max(Number(prev.salience) || 0, Number(row.salience) || 0),
        }),
      );
    } else {
      out.push(await sbInsert(WISDOM_ITEMS_TABLE, row));
    }
  }
  return out;
}

/** Latest wisdom run + top absorbed items. */
export async function GET() {
  try {
    const sb = serviceClient();
    let last: Record<string, unknown> | null = null;
    let top: Record<string, unknown>[] = [];
    if (sb) {
      const { data: run } = await sb
        .from(WISDOM_RUNS_TABLE)
        .select(
          'created_at,provider,summary,watched_count,digested_count,enhanced_count,absorbed_count,dry_run,meta',
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      last = run;
      const { data: items } = await sb
        .from(WISDOM_ITEMS_TABLE)
        .select('title,principle,application,domain,source_type,salience,confidence,absorbed_at')
        .eq('status', 'absorbed')
        .order('salience', { ascending: false })
        .limit(8);
      top = items || [];
    }

    return NextResponse.json({
      lastRunAt: last?.created_at ?? null,
      provider: last?.provider ?? null,
      summary: last?.summary ?? null,
      watched: last?.watched_count ?? null,
      digested: last?.digested_count ?? null,
      enhanced: last?.enhanced_count ?? null,
      absorbed: last?.absorbed_count ?? null,
      dryRun: last?.dry_run ?? null,
      top,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load wisdom status' },
      { status: 500 },
    );
  }
}

/** Run Watch→digest→enhance→absorb. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true || process.env.AXON_DRY_RUN === '1';
    const useHaiku = body?.haiku === true;
    const key = serviceKey();

    let corpus: Record<string, unknown>[] = [];
    let findings: Record<string, unknown>[] = [];
    let learnings: Record<string, unknown>[] = [];
    let signals: Record<string, unknown>[] = [];
    let jspaceState = null;

    if (key) {
      try {
        [corpus, findings, learnings, signals, jspaceState] = await Promise.all([
          sbSelect(
            'axon_nd_research_corpus',
            'select=external_id,domain,title,key_finding,axon_application,confidence,source_type,year&order=updated_at.desc.nullslast&limit=40',
          ),
          sbSelect(
            'axon_research_findings',
            'select=id,research_lane,title,summary,implementation_hint,priority,status,jspace_relevance,brain_gap_category&order=created_at.desc&limit=30',
          ),
          sbSelect(
            'Learnings',
            'project=eq.AXON&select=id,learning,source,category,project,date&order=date.desc.nullslast&limit=40',
          ),
          sbSelect(
            'axon_communication_signals',
            'select=id,signal_type,signal_key,signal_value,evidence_count,weight&order=last_reinforced_at.desc.nullslast&limit=30',
          ),
          getJspaceState(sbSelect, 'default'),
        ]);
      } catch {
        /* optional corpus */
      }
    }

    const result = await runWisdomAbsorbLoop({
      corpus,
      findings,
      learnings,
      signals,
      jspaceState,
      dryRun: dryRun || !key,
      forceHeuristic: !useHaiku,
      anthropicKey: process.env.ANTHROPIC_API_KEY || '',
      persistItems: async (rows: Record<string, unknown>[]) => upsertWisdomItems(rows),
      persistRun: async (record: Record<string, unknown>) => sbInsert(WISDOM_RUNS_TABLE, record),
      persistJspace: async (state: Record<string, unknown>) =>
        // sbSelect passed for upsert path; .mjs signature is untyped for TS
        saveJspaceState(sbInsert, sbPatch, state, 'default', sbSelect as never),
    });

    return NextResponse.json({
      ok: result.ok,
      dryRun: result.dryRun,
      provider: result.provider,
      watched: result.watchedCount,
      digested: result.digested.length,
      enhanced: result.enhancement.enhancedCount,
      absorbed: result.dryRun ? 0 : result.itemRows.length,
      summary: result.summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Wisdom loop failed' },
      { status: 500 },
    );
  }
}
