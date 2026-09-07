#!/usr/bin/env node
/**
 * A3 — cron catalog tells the truth.
 *
 * Pure-function test (offline, mocked roster rows) proving:
 *   1. Every catalog entry's derived cronUtc is EXACTLY what the mocked roster row's
 *      wake_config carries — never a hardcoded/fabricated value.
 *   2. A job with no matching roster row, a dormant row, an always-on
 *      (poller/listener) row, or a wake_config.cron value that isn't real 5-field cron
 *      syntax (a plain-English note) shows "not scheduled" / the right label instead
 *      of inventing a time.
 *   3. Every currently-live mac_mini AXON job in the mocked roster (repo === 'axon')
 *      is represented by a catalog entry, so the Cron tab has a toggle for it.
 *
 * No network, no Supabase — imports only the pure merge from
 * lib/axon-cron-catalog-core.mjs (a plain .mjs module, loadable under the Node 20 CI
 * pin in .github/workflows/axon-tests.yml with no TS loader; lib/axon-cron-jobs.ts
 * re-exports the same functions, typed, for TS callers). The live-fetch wiring
 * (lib/axon-cron-service.ts) and the .ts re-exports are exercised at the type level by
 * `npx tsc --noEmit`, not here.
 *
 * Run: node --test tests/axon-cron-catalog-roster.test.mjs
 */
import assert from 'node:assert/strict';
import {
  AXON_CRON_CATALOG_CORE as AXON_CRON_CATALOG,
  deriveScheduleFromWakeConfig,
  mergeCatalogWithRoster,
} from '../lib/axon-cron-catalog-core.mjs';

// ── mocked nvg_agent_routines rows (harness='mac_mini' already applied) ──────────
const MOCK_ROSTER = [
  {
    routine_id: 'axon-self-research',
    active: true,
    wake_type: 'local_only',
    wake_config: { cmds: ['node scripts/axon-self-research.mjs'], cron: ['0 11 * * 1,3,5,6'], repo: 'axon' },
    retired_at: null,
  },
  {
    routine_id: 'hermes-agent-dispatch',
    active: true,
    wake_type: 'local_only',
    // Real roster: TWO daily fires, not the three the old hardcoded catalog claimed.
    wake_config: { cmds: ['node scripts/hermes-seed-agent-dispatch.mjs'], cron: ['30 12 * * *', '30 16 * * *'], repo: 'nv-vault' },
    retired_at: null,
  },
  {
    routine_id: 'axon-mf-ad-tracker',
    active: false, // Dormant per Agentic OS audit 2026-09-05
    wake_type: 'local_only',
    wake_config: { cmds: ['node tests/mf-ad-tracker.test.mjs'], cron: ['15 */6 * * *'], repo: 'axon' },
    retired_at: null,
  },
  {
    routine_id: 'axon-executive-agent',
    active: true,
    wake_type: 'local_only',
    // Real roster: DOES have a live nightly schedule — the old catalog claimed null.
    wake_config: { cmds: ['npm run exec-agent'], cron: ['20 3 * * *'], repo: 'axon' },
    retired_at: null,
  },
  {
    routine_id: 'axon-social-media-research',
    active: true,
    wake_type: 'local_only',
    wake_config: { cmds: ['node scripts/axon-social-media-research.mjs'], cron: ['0 9 * * *'], repo: 'axon' },
    retired_at: null,
  },
  {
    routine_id: 'axon-seo-tracker',
    active: true,
    wake_type: 'local_only',
    wake_config: { cmds: ['node scripts/axon-seo-tracker.mjs'], cron: ['30 9 * * *'], repo: 'axon' },
    retired_at: null,
  },
  {
    // No matching catalog id at all (mini:axon-daily-model-build) — a real roster
    // row whose "cron" is a plain-English note, not machine cron syntax. Must never
    // be surfaced as a fabricated cronUtc.
    routine_id: 'mini:axon-daily-model-build',
    active: true,
    wake_type: 'local_only',
    wake_config: { cron: '9:30pm ET Mac mini', script: 'nv-vault/scripts/axon-daily-model-build.mjs' },
    retired_at: null,
  },
  {
    // Always-on poller — never cron-scheduled.
    routine_id: 'nvg-mini-jobs-poller',
    active: true,
    wake_type: 'local_only',
    wake_config: { run_mode: 'persistent polling loop, not cron' },
    retired_at: null,
  },
  // ── BPA-FOLLOWUP-CRON-TAB-MINI-TOGGLE-0906: the four mini jobs ──────────────────
  {
    routine_id: 'axon-spend-guard',
    platform: 'nvg_mini',
    active: true,
    wake_type: 'local_only',
    wake_config: { cmds: ['node scripts/axon-weekly-spend-guard.mjs'], cron: ['0 4 * * *'], repo: 'nv-vault' },
    retired_at: null,
  },
  {
    routine_id: 'axon-training-ingest',
    platform: 'nvg_mini',
    active: true,
    wake_type: 'local_only',
    wake_config: { cmds: ['node .github/scripts/axon-training-ingest.mjs'], cron: ['15 7 * * *'], repo: 'nv-vault' },
    retired_at: null,
  },
  {
    // Retired 2026-09-05 (Decision #1767) — active=false, no catalog entry at all.
    routine_id: 'axon-competitor-scan',
    platform: 'nvg_mini',
    active: false,
    wake_type: 'local_only',
    wake_config: { cmds: ['node .github/scripts/axon-competitor-scan.mjs'], cron: ['0 8 * * 1,3,5'], repo: 'nv-vault' },
    retired_at: null,
  },
  {
    // Retired 2026-09-06 — active=false, no catalog entry at all.
    routine_id: 'axon-model-heal',
    platform: 'nvg_mini',
    active: false,
    wake_type: 'local_only',
    wake_config: { cmds: ['node scripts/test-axon-local-model-runs.mjs'], cron: ['45 7 * * *'], repo: 'nv-vault' },
    retired_at: null,
  },
];

// ── 1 + 2: derive schedule per row, never fabricated ─────────────────────────────
{
  const research = deriveScheduleFromWakeConfig(MOCK_ROSTER[0]);
  assert.deepEqual(research.cronUtc, ['0 11 * * 1,3,5,6']);
  assert.equal(research.scheduleLabel, '0 11 * * 1,3,5,6');

  const dispatch = deriveScheduleFromWakeConfig(MOCK_ROSTER[1]);
  assert.deepEqual(dispatch.cronUtc, ['30 12 * * *', '30 16 * * *']);
  assert.notEqual(dispatch.scheduleLabel, '0 6,14,22 * * *', 'must not carry the old fabricated 3x/day claim');

  const adTracker = deriveScheduleFromWakeConfig(MOCK_ROSTER[2]);
  assert.deepEqual(adTracker.cronUtc, ['15 */6 * * *']);
  assert.match(adTracker.scheduleLabel, /disabled/, 'inactive roster row must say so, not show a live schedule');

  const exec = deriveScheduleFromWakeConfig(MOCK_ROSTER[3]);
  assert.deepEqual(exec.cronUtc, ['20 3 * * *'], 'must pick up the real nightly schedule the old catalog claimed did not exist');

  const dailyModelBuild = deriveScheduleFromWakeConfig(MOCK_ROSTER[6]);
  assert.deepEqual(dailyModelBuild.cronUtc, [], 'a plain-English note is not cron syntax and must not be surfaced as one');
  // BPA-FOLLOWUP-CRON-TAB-MINI-TOGGLE-0906 item 3: an unparseable human schedule
  // note must not be silently discarded down to a bare "not scheduled" — it is
  // shown as an explicitly non-authoritative note instead.
  assert.notEqual(dailyModelBuild.scheduleLabel, 'not scheduled', 'a human note must not be discarded to the bare unscheduled label');
  assert.match(dailyModelBuild.scheduleLabel, /not scheduled/);
  assert.match(dailyModelBuild.scheduleLabel, /9:30pm ET Mac mini/, 'the raw human note must survive into the label');
  assert.match(dailyModelBuild.scheduleLabel, /not real cron syntax|unverified/i, 'must flag the note as non-authoritative');

  const poller = deriveScheduleFromWakeConfig(MOCK_ROSTER[7]);
  assert.deepEqual(poller.cronUtc, []);
  assert.equal(poller.scheduleLabel, 'Always-on (not cron-scheduled)');

  const noRow = deriveScheduleFromWakeConfig(null);
  assert.deepEqual(noRow.cronUtc, []);
  assert.equal(noRow.scheduleLabel, 'not scheduled');
}

// ── catalog merge: no entry ever carries a cronUtc absent from the mocked roster ─
{
  const merged = mergeCatalogWithRoster(AXON_CRON_CATALOG, MOCK_ROSTER);
  const byId = new Map(merged.map((m) => [m.id, m]));

  for (const view of merged) {
    const rosterRow = MOCK_ROSTER.find((r) => r.routine_id === (view.rosterRoutineId ?? view.id));
    const rosterCron = Array.isArray(rosterRow?.wake_config?.cron)
      ? rosterRow.wake_config.cron
      : typeof rosterRow?.wake_config?.cron === 'string'
        ? [rosterRow.wake_config.cron]
        : [];

    for (const c of view.cronUtc) {
      assert.ok(
        rosterCron.includes(c),
        `catalog entry ${view.id} carries cronUtc "${c}" that is not present in its roster row's wake_config.cron`,
      );
    }
  }

  // axon-local-model-daily has no matching roster row in this mock (the real roster's
  // "mini:axon-daily-model-build" runs a different script under a different id) —
  // must show up unmatched, not silently inherit a schedule.
  const localModelDaily = byId.get('axon-local-model-daily');
  assert.ok(localModelDaily, 'axon-local-model-daily must still be a catalog entry (identity metadata is static)');
  assert.equal(localModelDaily.rosterMatched, false);
  assert.deepEqual(localModelDaily.cronUtc, []);
  assert.equal(localModelDaily.scheduleLabel, 'not scheduled');

  // hermes-agent-dispatch: catalog id/label stay put, schedule now matches the live
  // 2x/day roster instead of the stale 3x/day claim.
  const dispatch = byId.get('hermes-agent-dispatch');
  assert.equal(dispatch.rosterMatched, true);
  assert.deepEqual(dispatch.cronUtc, ['30 12 * * *', '30 16 * * *']);

  // axon-executive-agent: now correctly scheduled instead of falsely "no schedule".
  const exec = byId.get('axon-executive-agent');
  assert.equal(exec.rosterMatched, true);
  assert.deepEqual(exec.cronUtc, ['20 3 * * *']);

  // BPA-FOLLOWUP-CRON-TAB-MINI-TOGGLE-0906 item 1: axon-spend-guard and
  // axon-training-ingest are now catalogued and carry their live roster schedule.
  const spendGuard = byId.get('axon-spend-guard');
  assert.ok(spendGuard, 'axon-spend-guard must be a catalog entry');
  assert.equal(spendGuard.rosterMatched, true);
  assert.deepEqual(spendGuard.cronUtc, ['0 4 * * *']);
  assert.equal(spendGuard.rosterPlatform, 'nvg_mini');

  const trainingIngest = byId.get('axon-training-ingest');
  assert.ok(trainingIngest, 'axon-training-ingest must be a catalog entry');
  assert.equal(trainingIngest.rosterMatched, true);
  assert.deepEqual(trainingIngest.cronUtc, ['15 7 * * *']);
  assert.equal(trainingIngest.rosterPlatform, 'nvg_mini');

  // ...and axon-competitor-scan / axon-model-heal (retired 2026-09-05/06) must NOT
  // be catalog entries at all — pruned, not merely disabled.
  assert.equal(byId.get('axon-competitor-scan'), undefined, 'retired job must have no catalog entry');
  assert.equal(byId.get('axon-model-heal'), undefined, 'retired job must have no catalog entry');
}

// ── 3: every live mac_mini AXON job (repo === 'axon' in wake_config) in the mocked
// roster has a catalog entry, so the Cron tab can toggle it ──────────────────────
{
  const liveAxonRoutineIds = MOCK_ROSTER.filter(
    (r) => !r.retired_at && r.wake_config?.repo === 'axon',
  ).map((r) => r.routine_id);

  const catalogIds = new Set(AXON_CRON_CATALOG.map((d) => d.rosterRoutineId ?? d.id));

  const uncatalogued = liveAxonRoutineIds.filter((id) => !catalogIds.has(id));
  assert.deepEqual(
    uncatalogued,
    [],
    `live mac_mini AXON job(s) in the roster have no catalog entry, so the Cron tab has ` +
      `no toggle for them: ${uncatalogued.join(', ')}`,
  );
}

console.log('axon-cron-catalog-roster.test.mjs: all assertions passed');
