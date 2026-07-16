import { NextResponse } from 'next/server';
import {
  COMM_PROFILE_TABLE,
  COMM_SIGNALS_TABLE,
  COMM_SKILL_RUN_TABLE,
  buildCommSkillInstructions,
  mergeTechniquesWithDefaults,
  runCommSkillAdapt,
} from '@/lib/axon-comm-skill.mjs';
import { SUPABASE_URL } from '@/lib/constants.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
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

/** Preview current AX-COMM-SKILL prompt + technique weights */
export async function GET() {
  try {
    const rows = await sbSelect(COMM_PROFILE_TABLE, 'select=*&order=weight.desc');
    const techniques = mergeTechniquesWithDefaults(rows || []);
    return NextResponse.json({
      ok: true,
      skill: 'AX-COMM-SKILL',
      techniques,
      prompt: buildCommSkillInstructions(techniques, { channel: 'chat' }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Comm skill preview failed' },
      { status: 500 },
    );
  }
}

/** Background reinforce — heuristic weight bumps + audit row */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun =
      body?.dryRun === true ||
      process.env.AXON_DRY_RUN === '1' ||
      !serviceKey();

    const [techniques, signals] = await Promise.all([
      sbSelect(COMM_PROFILE_TABLE, 'select=*&order=weight.desc'),
      sbSelect(COMM_SIGNALS_TABLE, 'select=*&order=weight.desc&limit=40'),
    ]);

    const result = await runCommSkillAdapt({
      techniques: techniques || [],
      signals: signals || [],
      dryRun,
      operatorId: typeof body?.operatorId === 'string' ? body.operatorId : 'default',
      patchTechnique: async (update) => {
        const filter = update.id
          ? `id=eq.${update.id}`
          : `technique_id=eq.${encodeURIComponent(update.technique_id)}`;
        return sbPatch(COMM_PROFILE_TABLE, filter, {
          weight: update.next_weight,
          evidence: update.evidence,
          updated_at: new Date().toISOString(),
        });
      },
      persist: async (record) =>
        sbInsert(COMM_SKILL_RUN_TABLE, {
          operator_id: record.operator_id,
          day_key: record.day_key,
          provider: record.provider,
          dry_run: record.dry_run,
          techniques_scanned: record.techniques_scanned,
          signals_used: record.signals_used,
          techniques_updated: record.techniques_updated,
          summary: record.summary,
          meta: record.meta,
        }),
    });

    return NextResponse.json({
      ok: result.ok,
      dryRun: result.dryRun,
      summary: result.summary,
      plan: {
        techniqueCount: result.plan.techniqueCount,
        signalCount: result.plan.signalCount,
        changedCount: result.plan.changedCount,
        updates: result.plan.updates.filter((u) => u.changed),
      },
      appliedCount: result.appliedCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Comm skill adapt failed' },
      { status: 500 },
    );
  }
}
