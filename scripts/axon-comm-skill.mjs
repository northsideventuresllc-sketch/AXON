#!/usr/bin/env node
/**
 * AX-COMM-SKILL — background communication adaptation.
 *
 * Usage:
 *   npm run comm:skill
 *   npm run comm:skill:dry
 *   AXON_DRY_RUN=1 node scripts/axon-comm-skill.mjs
 *   node scripts/axon-comm-skill.mjs --checklist
 *
 * Dual-brain: vault AGENTS/CLAUDE SOP + NI-Brain technique/signal tables.
 * Secrets: SUPABASE_SERVICE_KEY (env wins over ni_platform_secrets)
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { SUPABASE_URL } from '../lib/constants.mjs';
import {
  COMM_PROFILE_TABLE,
  COMM_SIGNALS_TABLE,
  COMM_SKILL_RUN_TABLE,
  commSkillChecklist,
  runCommSkillAdapt,
} from '../lib/axon-comm-skill.mjs';
const dryRun = process.env.AXON_DRY_RUN === '1' || process.argv.includes('--dry');
const showChecklist = process.argv.includes('--checklist');

async function main() {
  if (showChecklist) {
    console.log('AX-COMM-SKILL checklist\n');
    for (const [i, line] of commSkillChecklist().entries()) {
      console.log(`${i + 1}. ${line}`);
    }
    return;
  }

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  let techniques = [];
  let signals = [];
  let sbPatch = null;
  let sbInsert = null;

  if (serviceKey) {
    const client = createSupabaseClient(serviceKey);
    sbPatch = client.sbPatch;
    sbInsert = client.sbInsert;
    try {
      techniques = await client.sbSelect(
        COMM_PROFILE_TABLE,
        'select=*&order=weight.desc',
      );
      signals = await client.sbSelect(
        COMM_SIGNALS_TABLE,
        'select=*&order=weight.desc&limit=40',
      );
    } catch (err) {
      console.warn('NI-Brain read failed — continuing with defaults:', err.message);
    }
  } else if (!dryRun) {
    console.warn('No SUPABASE_SERVICE_KEY — forcing dry-run (no persist).');
  }

  const effectiveDry = dryRun || !serviceKey;

  const result = await runCommSkillAdapt({
    techniques: techniques || [],
    signals: signals || [],
    dryRun: effectiveDry,
    operatorId: 'default',
    patchTechnique: async (update) => {
      if (!sbPatch) return null;
      const filter = update.id
        ? `id=eq.${update.id}`
        : `technique_id=eq.${encodeURIComponent(update.technique_id)}`;
      return sbPatch(COMM_PROFILE_TABLE, filter, {
        weight: update.next_weight,
        evidence: update.evidence,
        updated_at: new Date().toISOString(),
      });
    },
    persist: async (record) => {
      if (!sbInsert) return null;
      return sbInsert(COMM_SKILL_RUN_TABLE, {
        operator_id: record.operator_id,
        day_key: record.day_key,
        provider: record.provider,
        dry_run: record.dry_run,
        techniques_scanned: record.techniques_scanned,
        signals_used: record.signals_used,
        techniques_updated: record.techniques_updated,
        summary: record.summary,
        meta: record.meta,
      });
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        dryRun: result.dryRun,
        provider: result.plan.provider,
        techniques: result.plan.techniqueCount,
        signals: result.plan.signalCount,
        changed: result.plan.changedCount,
        applied: result.appliedCount,
        summary: result.summary,
        brain: SUPABASE_URL,
      },
      null,
      2,
    ),
  );

  if (effectiveDry) {
    console.log('\n[DRY RUN] No technique weights or run rows written.');
    console.log('Tip: npm run comm:skill:dry  |  npm run comm:skill -- --checklist');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
