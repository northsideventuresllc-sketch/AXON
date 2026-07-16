import { NextResponse } from 'next/server';
import { refreshTonePresetFromSignals } from '@/lib/axon-web-chat';
import {
  COMM_PROFILE_TABLE,
  COMM_SIGNALS_TABLE,
  COMM_SKILL_RUN_TABLE,
  runCommSkillAdapt,
} from '@/lib/axon-comm-skill.mjs';
import { createSupabaseClient } from '@/lib/supabase.mjs';

/** Background tone + AX-COMM-SKILL refresh (writes axon_comm_skill_runs). */
export async function POST() {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    const dryRun = !key || process.env.AXON_DRY_RUN === '1';
    const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(key || 'missing');

    let techniques: unknown[] = [];
    let signals: unknown[] = [];
    if (key) {
      [techniques, signals] = await Promise.all([
        sbSelect(COMM_PROFILE_TABLE, 'select=*&order=weight.desc'),
        sbSelect(COMM_SIGNALS_TABLE, 'select=*&order=weight.desc&limit=40'),
      ]);
    }

    const skill = await runCommSkillAdapt({
      techniques: (techniques || []) as Array<Record<string, unknown>>,
      signals: (signals || []) as Array<Record<string, unknown>>,
      dryRun,
      patchTechnique: async (update) => {
        if (!key) return null;
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
        if (!key) return null;
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

    const preset = await refreshTonePresetFromSignals();
    return NextResponse.json({
      ok: true,
      tone_preset: preset,
      comm_skill: {
        summary: skill.summary,
        changedCount: skill.plan.changedCount,
        dryRun: skill.dryRun,
        persisted: Boolean(skill.persisted),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 },
    );
  }
}
