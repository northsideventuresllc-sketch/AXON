/**
 * AXON cron job catalog — definitions for Droid Space + Repo Manager Cron tab.
 *
 * ── A3: THE CATALOG NO LONGER INVENTS SCHEDULES ────────────────────────────────
 * This file used to hardcode `cronUtc` per job. Several of those values had drifted
 * from what actually runs: `hermes-agent-dispatch` claimed `0 6,14,22 * * *` (3×/day)
 * while the live NI-Brain roster (`nvg_agent_routines`, harness='mac_mini') has run it
 * twice daily (`30 12 * * *`, `30 16 * * *`) since 2026-07-21; `axon-executive-agent`
 * claimed no schedule (`cronUtc: null`) while the roster shows it fires nightly at
 * `20 3 * * *`. Two jobs that run AXON's own scripts on the mini
 * (axon-social-media-research, axon-seo-tracker) were not in this catalog at all, so
 * the Cron tab had no toggle for them.
 *
 * The fix: the STATIC identity/UI metadata (id, title, description, which
 * workflow/venture/droid it maps to) plus the pure schedule-derivation functions now
 * live in lib/axon-cron-catalog-core.mjs (plain .mjs, no TS) so
 * tests/axon-cron-catalog-roster.test.mjs can load it directly under Node 20 — the CI
 * pin in .github/workflows/axon-tests.yml, which cannot load a .ts file without a
 * loader. This file re-exports everything from there with types attached, and (per
 * #178's A9 extraction) re-exports the pure cron-math from axon-cron-parser-core.mjs
 * the same way. Schedule truth (`cronUtc`, `scheduleLabel`, whether it's actually
 * scheduled) is derived at request time from the live roster row in NI-Brain
 * `nvg_agent_routines` — see `deriveScheduleFromWakeConfig` / `mergeCatalogWithRoster`
 * (pure, no I/O; the live Supabase read lives in lib/axon-cron-service.ts).
 *
 * When a roster row has no schedule this reads (no matching row, a dormant job, an
 * always-on poller/listener, or a wake_config.cron value that isn't real 5-field cron
 * syntax — e.g. "9:30pm ET Mac mini" is a note, not a cron expression AXON can quote),
 * the job shows "not scheduled" rather than a fabricated time.
 */
import { estimateNextRunUtc, estimateNextRunUtcMulti } from './axon-cron-parser-core.mjs';
import {
  AXON_CRON_CATALOG_CORE,
  deriveScheduleFromWakeConfig as deriveScheduleFromWakeConfigCore,
  mergeCatalogWithRoster as mergeCatalogWithRosterCore,
} from './axon-cron-catalog-core.mjs';

// A9 (#178) + A3-merge: re-exported unchanged so every existing
// `import { estimateNextRunUtc } from '@/lib/axon-cron-jobs'` keeps working — the pure
// cron-math itself lives in axon-cron-parser-core.mjs so it can be unit-tested
// without a TS loader.
export { estimateNextRunUtc, estimateNextRunUtcMulti };

export type DroidFaceShape = 'circle' | 'square' | 'triangle' | 'hex' | 'diamond';

export type AxonCronJobDef = {
  id: string;
  /** nvg_agent_routines.routine_id to look this job's schedule up by, when it differs from id. */
  rosterRoutineId?: string;
  title: string;
  workflowFile: string;
  workflowRepo: string;
  venture: string;
  droidRole: string;
  faceShape: DroidFaceShape;
  axonTools: string[];
  description: string;
  howItWorks: string;
  whyImportant: string;
  defaultEnabled: boolean;
};

/**
 * Static catalog data lives in axon-cron-catalog-core.mjs — typed here, defined there.
 * Cast at the boundary: TS infers loose shapes (e.g. `faceShape: string`) from a plain
 * .mjs with no JSDoc types, since this project doesn't enable `checkJs`.
 */
export const AXON_CRON_CATALOG: AxonCronJobDef[] = AXON_CRON_CATALOG_CORE as AxonCronJobDef[];

export function getCronJobDef(id: string): AxonCronJobDef | undefined {
  return AXON_CRON_CATALOG.find((j) => j.id === id);
}

// ── Live-schedule derivation (pure — no I/O; implementation in axon-cron-catalog-core.mjs) ──

/** The shape this file needs from a `nvg_agent_routines` row. */
export type RosterRoutineRow = {
  routine_id: string;
  active: boolean | null;
  wake_type: string | null;
  wake_config: Record<string, unknown> | null;
  retired_at: string | null;
};

export type DerivedSchedule = {
  /** Every real 5-field cron string this routine's wake_config actually carries. */
  cronUtc: string[];
  /** Human label — never invents a time; says "not scheduled" when it can't derive one. */
  scheduleLabel: string;
};

/**
 * Read whatever schedule truth is actually present in a roster row's `wake_config`.
 * Never fabricates a cron string — a value that isn't real 5-field cron syntax (a
 * plain-English note like "9:30pm ET Mac mini", a `run_mode` note, a missing field)
 * is reported as unscheduled/undetermined instead of guessed at.
 */
export function deriveScheduleFromWakeConfig(
  row: Pick<RosterRoutineRow, 'active' | 'wake_config' | 'retired_at'> | null | undefined,
): DerivedSchedule {
  return deriveScheduleFromWakeConfigCore(row);
}

export type CatalogRosterMerge = AxonCronJobDef & {
  rosterMatched: boolean;
  rosterActive: boolean | null;
  cronUtc: string[];
  scheduleLabel: string;
};

/**
 * PURE merge: catalog identity metadata + live roster schedule truth, no network and
 * no defaults invented for a job the roster doesn't (or no longer) know about.
 * `rosterRows` should already be filtered to `harness='mac_mini'` by the caller.
 */
export function mergeCatalogWithRoster(
  defs: AxonCronJobDef[],
  rosterRows: RosterRoutineRow[],
): CatalogRosterMerge[] {
  return mergeCatalogWithRosterCore(defs, rosterRows) as CatalogRosterMerge[];
}

export type AxonCronJobView = AxonCronJobDef & {
  enabled: boolean;
  scheduled: boolean;
  cronUtc: string[];
  scheduleLabel: string;
  rosterMatched: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  nextRunAt: string | null;
  warnings: string[];
};
