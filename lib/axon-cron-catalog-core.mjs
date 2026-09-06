/**
 * A3 (merged with #178's A9 parser extraction, 2026-09-06) — the cron catalog's
 * static data plus the pure roster-merge functions, in a plain .mjs module so
 * tests/axon-cron-catalog-roster.test.mjs can load it directly under Node 20
 * (the CI pin in .github/workflows/axon-tests.yml) with no TS loader. Types live
 * in lib/axon-cron-jobs.ts, which imports and re-exports everything here unchanged.
 *
 * THE CATALOG NO LONGER INVENTS SCHEDULES. This data used to carry a hardcoded
 * `cronUtc` per job. Several of those values had drifted from what actually runs:
 * `hermes-agent-dispatch` claimed `0 6,14,22 * * *` (3×/day) while the live NI-Brain
 * roster (`nvg_agent_routines`, harness='mac_mini') has run it twice daily
 * (`30 12 * * *`, `30 16 * * *`) since 2026-07-21; `axon-executive-agent` claimed no
 * schedule while the roster shows it fires nightly at `20 3 * * *`. Two jobs that run
 * AXON's own scripts on the mini (axon-social-media-research, axon-seo-tracker) were
 * not in this catalog at all, so the Cron tab had no toggle for them.
 *
 * AXON_CRON_CATALOG_CORE now only holds static identity/UI metadata (id, title,
 * description, which workflow/venture/droid it maps to). Schedule truth (`cronUtc`,
 * `scheduleLabel`, whether it's actually scheduled) is derived at request time from
 * the live roster row in NI-Brain `nvg_agent_routines` by
 * `deriveScheduleFromWakeConfig` / `mergeCatalogWithRoster` below (pure, no I/O — the
 * live Supabase read lives in lib/axon-cron-service.ts).
 *
 * When a roster row has no schedule this can read (no matching row, a dormant job, an
 * always-on poller/listener, or a wake_config.cron value that isn't real 5-field cron
 * syntax — e.g. "9:30pm ET Mac mini" is a note, not a cron expression AXON can quote),
 * the job shows "not scheduled" rather than a fabricated time.
 */

export const AXON_CRON_CATALOG_CORE = [
  {
    id: 'axon-self-research',
    title: 'Autonomous Research',
    workflowFile: 'axon-self-research.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Research',
    faceShape: 'circle',
    axonTools: ['NI Outreach HQ', 'Briefing Panel'],
    description:
      'Scans AI models, open-source repos, and neuroscience gaps — feeds your daily AXON brief.',
    howItWorks:
      'Mac mini cron fires on schedule, runs research lanes (Haiku + SERP), writes findings + axon_research_runs lab log to NI-Brain, and surfaces highlights in briefing.',
    whyImportant:
      'Keeps JB ahead of model releases and OSS tooling without manual RSS hunting — autonomous intelligence loop.',
    defaultEnabled: true,
  },
  {
    id: 'hermes-agent-dispatch',
    title: 'Hermes Dispatch Seed',
    workflowFile: 'hermes-agent-dispatch.yml',
    workflowRepo: 'northsideventuresllc-sketch/nv-vault',
    venture: 'nv-vault',
    droidRole: 'Dispatch',
    faceShape: 'hex',
    axonTools: ['Repo Manager Agent Dispatch', 'NI Marketing HQ'],
    description: 'Seeds agent_dispatch queue from Job Code Registry and fires manager workflows.',
    howItWorks:
      'Mac mini cron seeds NI-Brain queue, optionally fires GitHub relay workflows, Telegram summary to JB.',
    whyImportant: 'Feeds the Repo Manager queue — without this droid the dispatch board stays empty.',
    defaultEnabled: true,
  },
  {
    id: 'axon-mf-ad-tracker',
    title: 'Match Fit Ad Tracker Sync',
    workflowFile: 'axon-mf-ad-tracker.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'Match Fit',
    droidRole: 'Ads',
    faceShape: 'square',
    axonTools: ['Match Fit Admin', 'AXON Management-Match Fit'],
    description:
      'Pulls live Meta + TikTok daily snapshots (AX-AD) into NI-Brain for Match Fit Ad Tracking.',
    howItWorks:
      'Mac mini cron loads Ads API keys from ni_platform_secrets, writes mf_ad_platform_daily_snapshots, Telegram cues only if keys missing.',
    whyImportant:
      'July $50 MF tests need spend/click truth so August winners are locked from real ROAS — not gut feel.',
    defaultEnabled: false,
  },
  {
    id: 'axon-local-model-daily',
    title: 'Local Daily Model Build',
    workflowFile: 'axon-local-model-daily.mjs',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Model',
    faceShape: 'circle',
    axonTools: ['NI Outreach HQ', 'Follow-Up Engine'],
    description:
      'AX-MODEL-DAILY — Ollama (or heuristic) scoring loop that calibrates Phase 1 outreach without burning paid API quota.',
    howItWorks:
      'npm run model:daily probes Ollama, scores recent leads, writes axon_local_model_runs. HQ Phase 1 strip can trigger the same path.',
    whyImportant:
      'Moves daily score/follow-up interactivity into AXON so JB spends less on cloud LLM subscriptions for routine calibration.',
    defaultEnabled: true,
  },
  {
    id: 'axon-comm-skill',
    title: 'Communication Skill Practice',
    workflowFile: 'axon-comm-skill.mjs',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Comms',
    faceShape: 'diamond',
    axonTools: ['Test Mode', 'Repo Manager Agent Dispatch'],
    description:
      'AX-COMM-SKILL — heuristic technique weight practice from communication signals; writes axon_comm_skill_runs (AX-COMM-TELEMETRY).',
    howItWorks:
      'npm run comm:skill (or POST /api/axon/comm-skill / learning refresh) scans axon_communication_profile + signals, bumps weights, inserts an audit row into axon_comm_skill_runs.',
    whyImportant:
      'Without run telemetry JB cannot see whether the communication adaptation skill is practicing — this closes the Post-Comm gap.',
    defaultEnabled: true,
  },
  {
    id: 'axon-executive-agent',
    title: 'AXON Executive Agent',
    workflowFile: 'axon-executive-agent.mjs',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Learning',
    faceShape: 'hex',
    axonTools: ['Briefing Panel', 'NI Outreach HQ'],
    description:
      'AXON Executive Agent — rebuilt from AX-WISDOM-LOOP (2026-08-26): watch→digest→enhance absorb of ND corpus, research, Learnings, and signals into durable wisdom, plus durable Decisions/Learnings ingest, cross-repo git history, training-bundle merge, RunPod manifest sync, and the agent_bus/Slack/Telegram bridge.',
    howItWorks:
      'Mac mini cron runs npm run wisdom (scripts/axon-wisdom-loop.mjs, now a thin forwarding shim) which invokes scripts/axon-executive-agent.mjs — ranks multi-source wisdom, enhances J-space, upserts axon_wisdom_items + axon_wisdom_runs, and bridges to agent_bus/Slack/Telegram.',
    whyImportant:
      'Slow Takeover / Mac ON path — AXON keeps JB corrections and verified ND principles without re-deriving them every session. Catalog id matches the roster routine_id so the dashboard enabled-toggle actually reaches this job.',
    defaultEnabled: true,
  },
  {
    // Added A3 — runs scripts/axon-social-media-research.mjs on the mini
    // (repo='axon' in the live roster's wake_config) but was missing from this
    // catalog entirely, so the Cron tab had no toggle for it.
    id: 'axon-social-media-research',
    title: 'AXON Content Research',
    workflowFile: 'axon-social-media-research.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Research',
    faceShape: 'circle',
    axonTools: ['NI Marketing HQ', 'Briefing Panel'],
    description:
      'Per-venture social trend + SEO + AI-search-optimization research feeding CONTENT sub-agents.',
    howItWorks:
      'Mac mini cron runs scripts/axon-social-media-research.mjs, writes findings to NI-Brain for the content calendar and briefing.',
    whyImportant:
      'Feeds venture social/content planning with real trend data instead of guesswork.',
    defaultEnabled: true,
  },
  {
    // Added A3 — same gap as axon-social-media-research above.
    id: 'axon-seo-tracker',
    title: 'AXON SEO Tracker',
    workflowFile: 'axon-seo-tracker.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Research',
    faceShape: 'circle',
    axonTools: ['NI Marketing HQ', 'Briefing Panel'],
    description: 'Per-venture SEO tracking dispatch — ranks, search-console, backlinks per venture.',
    howItWorks:
      'Mac mini cron runs scripts/axon-seo-tracker.mjs; self-reports NEEDS_CREDENTIALS per source when a data source is not wired up yet.',
    whyImportant: 'Keeps SEO visibility on the roster even while most sources are not live yet.',
    defaultEnabled: true,
  },
];

/** Real 5-field cron syntax — minute hour day-of-month month day-of-week. */
const CRON_FIELD = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/;
function isRealCronExpression(value) {
  if (typeof value !== 'string') return false;
  const parts = value.trim().split(/\s+/);
  return parts.length === 5 && parts.every((p) => CRON_FIELD.test(p));
}

/**
 * Read whatever schedule truth is actually present in a roster row's `wake_config`.
 * Never fabricates a cron string — a value that isn't real 5-field cron syntax (a
 * plain-English note like "9:30pm ET Mac mini", a `run_mode` note, a missing field)
 * is reported as unscheduled/undetermined instead of guessed at.
 *
 * @param {{ active: boolean|null, wake_config: Record<string, unknown>|null, retired_at: string|null }|null|undefined} row
 * @returns {{ cronUtc: string[], scheduleLabel: string }}
 */
export function deriveScheduleFromWakeConfig(row) {
  if (!row || row.retired_at) return { cronUtc: [], scheduleLabel: 'not scheduled' };

  const cfg = row.wake_config ?? {};

  if (cfg.dormant === true) return { cronUtc: [], scheduleLabel: 'Dormant' };

  if (typeof cfg.run_mode === 'string' && /persistent|polling|background/i.test(cfg.run_mode)) {
    return { cronUtc: [], scheduleLabel: 'Always-on (not cron-scheduled)' };
  }

  const rawCron = cfg.cron;
  const candidates = Array.isArray(rawCron) ? rawCron : rawCron != null ? [rawCron] : [];
  const cronUtc = candidates.filter(isRealCronExpression);

  if (cronUtc.length === 0) return { cronUtc: [], scheduleLabel: 'not scheduled' };
  if (row.active === false) return { cronUtc, scheduleLabel: `${cronUtc.join(' & ')} (currently disabled)` };
  return { cronUtc, scheduleLabel: cronUtc.join(' & ') };
}

/**
 * PURE merge: catalog identity metadata + live roster schedule truth, no network and
 * no defaults invented for a job the roster doesn't (or no longer) know about.
 * `rosterRows` should already be filtered to `harness='mac_mini'` by the caller.
 *
 * @param {Array<{ id: string, rosterRoutineId?: string }>} defs
 * @param {Array<{ routine_id: string, active: boolean|null, wake_config: Record<string, unknown>|null, retired_at: string|null }>} rosterRows
 */
export function mergeCatalogWithRoster(defs, rosterRows) {
  const byRoutineId = new Map(rosterRows.map((r) => [r.routine_id, r]));

  return defs.map((def) => {
    const row = byRoutineId.get(def.rosterRoutineId ?? def.id);
    const { cronUtc, scheduleLabel } = deriveScheduleFromWakeConfig(row);
    return {
      ...def,
      rosterMatched: Boolean(row),
      rosterActive: row?.active ?? null,
      cronUtc,
      scheduleLabel,
    };
  });
}
