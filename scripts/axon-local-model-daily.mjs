#!/usr/bin/env node
/**
 * AX-MODEL-DAILY — local daily model build (Ollama or heuristic).
 *
 * Usage:
 *   npm run model:daily
 *   npm run model:daily:dry
 *   AXON_DRY_RUN=1 node scripts/axon-local-model-daily.mjs
 *   node scripts/axon-local-model-daily.mjs --heuristic
 *
 * Secrets (env wins over ni_platform_secrets):
 *   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — required for live persist
 * Optional:
 *   OLLAMA_HOST (default http://127.0.0.1:11434)
 *   OLLAMA_MODEL (default llama3.2)
 *   AXON_LOCAL_MODEL_HEURISTIC=1 — force heuristic even if Ollama is up
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { SUPABASE_URL, SOURCE } from '../lib/constants.mjs';
import {
  LOCAL_MODEL_RUN_TABLE,
  macCronChecklist,
  runLocalModelDaily,
} from '../lib/local-model-daily.mjs';
import {
  fetchOutreachTrainingSignals,
  summarizeOutreachTraining,
} from '../lib/outreach-learn-core.mjs';

const dryRun = process.env.AXON_DRY_RUN === '1' || process.argv.includes('--dry');
const forceHeuristic =
  process.env.AXON_LOCAL_MODEL_HEURISTIC === '1' || process.argv.includes('--heuristic');
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

async function main() {
  if (showChecklist) {
    console.log('Mac cron checklist — AX-MODEL-DAILY\n');
    for (const [i, line] of macCronChecklist().entries()) {
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
  let signals = [];
  let leads = [];

  if (serviceKey) {
    const client = createSupabaseClient(serviceKey);
    sbSelect = client.sbSelect;
    sbInsert = client.sbInsert;
    // Refresh env overrides from brain secrets (never print values)
    for (const key of ['OLLAMA_HOST', 'OLLAMA_MODEL']) {
      if (!process.env[key]) {
        const v = await secret(sbSelect, key);
        if (v) process.env[key] = v;
      }
    }
    try {
      signals = await fetchOutreachTrainingSignals(sbSelect, { limit: 80, days: 60 });
      leads = await sbSelect(
        'ni_brain_outreach',
        `source=eq.${SOURCE}&select=id,handle,niche,target_group,why_match_fit,comment_draft,dm_draft,notes,status,created_at&order=created_at.desc&limit=40`,
      );
    } catch (err) {
      console.warn('NI-Brain read failed — continuing with empty corpus:', err.message);
    }
  } else if (!dryRun) {
    console.warn('No SUPABASE_SERVICE_KEY — forcing dry-run (no persist).');
  }

  const training = summarizeOutreachTraining(signals || []);
  const effectiveDry = dryRun || !serviceKey;

  const result = await runLocalModelDaily({
    signals: signals || [],
    leads: leads || [],
    training,
    dryRun: effectiveDry,
    forceHeuristic,
    persist: async (record) => {
      if (!sbInsert) return null;
      return sbInsert(LOCAL_MODEL_RUN_TABLE, {
        ...record,
        meta: record.meta,
      });
    },
  });

  console.log(JSON.stringify({
    ok: result.ok,
    dryRun: result.dryRun,
    provider: result.batch.provider,
    model: result.batch.model,
    ollamaAvailable: result.probe.available,
    leadsScored: result.batch.scored.length,
    avgScore: result.batch.avgScore,
    queueable: result.batch.queueable,
    signalsUsed: result.dataset.signalCount,
    summary: result.summary,
    brain: SUPABASE_URL,
  }, null, 2));

  if (effectiveDry) {
    console.log('\n[DRY RUN] No rows written to axon_local_model_runs.');
    console.log('Tip: npm run model:daily:dry  |  npm run model:daily -- --checklist');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
