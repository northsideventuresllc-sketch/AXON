#!/usr/bin/env node
/**
 * AX-WISDOM-LOOP — Watch→digest→enhance wisdom absorb.
 *
 * Usage:
 *   npm run wisdom
 *   npm run wisdom:dry
 *   AXON_DRY_RUN=1 node scripts/axon-wisdom-loop.mjs
 *   node scripts/axon-wisdom-loop.mjs --checklist
 *
 * Secrets (env wins over ni_platform_secrets):
 *   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — required for live persist
 * Optional:
 *   ANTHROPIC_API_KEY — Haiku polish (off by default; pass --haiku)
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { SUPABASE_URL } from '../lib/constants.mjs';
import {
  WISDOM_ITEMS_TABLE,
  WISDOM_RUNS_TABLE,
  runWisdomAbsorbLoop,
  wisdomLoopChecklist,
} from '../lib/wisdom-absorb-loop.mjs';
import {
  getJspaceState,
  saveJspaceState,
} from '../lib/axon-j-space-core.mjs';

const dryRun = process.env.AXON_DRY_RUN === '1' || process.argv.includes('--dry');
const useHaiku = process.argv.includes('--haiku');
const showChecklist = process.argv.includes('--checklist');

async function secret(sbSelect, key) {
  if (process.env[key]?.trim()) return process.env[key].trim();
  if (!sbSelect) return '';
  try {
    const rows = await sbSelect(
      'ni_platform_secrets',
      `key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    );
    return rows?.[0]?.value?.trim() || '';
  } catch {
    return '';
  }
}

async function upsertWisdomItems(sbSelect, sbInsert, sbPatch, rows) {
  const out = [];
  for (const row of rows) {
    const existing = await sbSelect(
      WISDOM_ITEMS_TABLE,
      `operator_id=eq.${encodeURIComponent(row.operator_id)}&fingerprint=eq.${encodeURIComponent(row.fingerprint)}&select=id,salience&limit=1`,
    );
    if (existing?.length) {
      const prev = existing[0];
      const patched = await sbPatch(
        WISDOM_ITEMS_TABLE,
        `id=eq.${prev.id}`,
        {
          title: row.title,
          principle: row.principle,
          application: row.application,
          domain: row.domain,
          source_type: row.source_type,
          source_ref: row.source_ref,
          confidence: row.confidence,
          salience: Math.max(Number(prev.salience) || 0, row.salience),
          status: 'absorbed',
          meta: row.meta,
          absorbed_at: row.absorbed_at,
          updated_at: row.updated_at,
        },
      );
      out.push(patched);
    } else {
      out.push(await sbInsert(WISDOM_ITEMS_TABLE, row));
    }
  }
  return out;
}

async function main() {
  if (showChecklist) {
    console.log('Mac checklist — AX-WISDOM-LOOP\n');
    for (const [i, line] of wisdomLoopChecklist().entries()) {
      console.log(`${i + 1}. ${line}`);
    }
    return;
  }

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  let sbSelect = null;
  let sbInsert = null;
  let sbPatch = null;
  let corpus = [];
  let findings = [];
  let learnings = [];
  let signals = [];
  let jspaceState = null;
  let anthropicKey = process.env.ANTHROPIC_API_KEY || '';

  if (serviceKey) {
    const client = createSupabaseClient(serviceKey);
    sbSelect = client.sbSelect;
    sbInsert = client.sbInsert;
    sbPatch = client.sbPatch;
    if (!anthropicKey) anthropicKey = await secret(sbSelect, 'ANTHROPIC_API_KEY');

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
    } catch (err) {
      console.warn('NI-Brain read failed — continuing with empty corpus:', err.message);
    }
  } else if (!dryRun) {
    console.warn('No SUPABASE_SERVICE_KEY — forcing dry-run (no persist).');
  }

  const effectiveDry = dryRun || !serviceKey;

  const result = await runWisdomAbsorbLoop({
    corpus: corpus || [],
    findings: findings || [],
    learnings: learnings || [],
    signals: signals || [],
    jspaceState,
    dryRun: effectiveDry,
    forceHeuristic: !useHaiku,
    anthropicKey,
    persistItems: async (rows) => upsertWisdomItems(sbSelect, sbInsert, sbPatch, rows),
    persistRun: async (record) => sbInsert(WISDOM_RUNS_TABLE, record),
    persistJspace: async (state) =>
      saveJspaceState(sbInsert, sbPatch, state, 'default', sbSelect),
  });

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        dryRun: result.dryRun,
        provider: result.provider,
        watched: result.watchedCount,
        digested: result.digested.length,
        enhanced: result.enhancement.enhancedCount,
        absorbed: result.dryRun ? 0 : result.itemRows.length,
        summary: result.summary,
        top: result.digested.slice(0, 5).map((w) => ({
          title: w.title,
          salience: w.salience,
          source_type: w.source_type,
          domain: w.domain,
        })),
        brain: SUPABASE_URL,
      },
      null,
      2,
    ),
  );

  if (effectiveDry) {
    console.log('\n[DRY RUN] No rows written to axon_wisdom_items / axon_wisdom_runs.');
    console.log('Tip: npm run wisdom:dry  |  npm run wisdom -- --checklist');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
