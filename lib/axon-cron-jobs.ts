/**
 * AXON cron job catalog — definitions for Droid Space + Repo Manager Cron tab.
 * Runtime state (enabled, last/next run) lives in NI-Brain `axon_cron_jobs`.
 */

export type DroidFaceShape = 'circle' | 'square' | 'triangle' | 'hex' | 'diamond';

export type AxonCronJobDef = {
  id: string;
  title: string;
  scheduleLabel: string;
  /** Standard 5-field cron (UTC). Empty when schedule is disabled in workflow YAML. */
  cronUtc: string | null;
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

export const AXON_CRON_CATALOG: AxonCronJobDef[] = [
  {
    id: 'axon-self-research',
    title: 'Autonomous Research',
    scheduleLabel: 'Mon / Wed / Fri / Sat · 6:00 AM EST',
    cronUtc: '0 11 * * 1,3,5,6',
    workflowFile: 'axon-self-research.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Research',
    faceShape: 'circle',
    axonTools: ['NI Outreach HQ', 'Briefing Panel'],
    description:
      'Scans AI models, open-source repos, and neuroscience gaps — feeds your daily AXON brief.',
    howItWorks:
      'GitHub Actions fires on schedule, runs research lanes (Haiku + SERP), writes findings + axon_research_runs lab log to NI-Brain, and surfaces highlights in briefing.',
    whyImportant:
      'Keeps JB ahead of model releases and OSS tooling without manual RSS hunting — autonomous intelligence loop.',
    defaultEnabled: true,
  },
  {
    id: 'axon-telegram-poll',
    title: 'Telegram Command Poll',
    scheduleLabel: 'Every 15 minutes',
    cronUtc: '*/15 * * * *',
    workflowFile: 'axon-telegram-poll.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Comms',
    faceShape: 'diamond',
    axonTools: ['Test Mode', 'Repo Manager Agent Dispatch'],
    description: 'Fallback poll for @axon_ni_bot when webhook is unavailable — approve sends, dispatch cues.',
    howItWorks:
      'Polls Telegram getUpdates, mirrors chat to dashboard, routes approve/reject to outreach and dispatch handlers.',
    whyImportant:
      'No auto-send without JB approval — this droid is the safety net so Telegram cues never stall.',
    defaultEnabled: true,
  },
  {
    id: 'axon-content-batch-notify',
    title: 'Content Machine Batch',
    scheduleLabel: 'Daily · 8:00 AM EST',
    cronUtc: '0 13 * * *',
    workflowFile: 'axon-content-batch-notify.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'Match Fit',
    droidRole: 'Content',
    faceShape: 'square',
    axonTools: ['AXON Management-Match Fit', 'NI Marketing HQ'],
    description: 'Morning Telegram preview of pending Match Fit content awaiting JB approval.',
    howItWorks:
      'After Content Machine generation window, bundles pending posts and sends a Telegram summary — no auto-publish.',
    whyImportant: 'Match Fit social cadence depends on this batch cue — operator approves before anything goes live.',
    defaultEnabled: true,
  },
  {
    id: 'axon-ni-outreach',
    title: 'NI Outreach Nightly',
    scheduleLabel: 'Manual only (auto cron off)',
    cronUtc: null,
    workflowFile: 'axon-ni-outreach.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'NORTHSiDE',
    droidRole: 'Outreach',
    faceShape: 'triangle',
    axonTools: ['NI Outreach HQ'],
    description: 'Prospect discovery + draft generation — training mode; workflow_dispatch only until ICP locked.',
    howItWorks:
      'When enabled and manually dispatched, runs ICP scan, scores leads, drafts outreach — all pending Telegram approve.',
    whyImportant: 'Core revenue engine — kept manual while JB trains ICP and reject reasons.',
    defaultEnabled: false,
  },
  {
    id: 'hermes-agent-dispatch',
    title: 'Hermes Dispatch Seed',
    scheduleLabel: '3× daily (nv-vault)',
    cronUtc: '0 6,14,22 * * *',
    workflowFile: 'hermes-agent-dispatch.yml',
    workflowRepo: 'northsideventuresllc-sketch/nv-vault',
    venture: 'nv-vault',
    droidRole: 'Dispatch',
    faceShape: 'hex',
    axonTools: ['Repo Manager Agent Dispatch', 'NI Marketing HQ'],
    description: 'Seeds agent_dispatch queue from Job Code Registry and fires manager workflows.',
    howItWorks:
      'Hermes workflow seeds NI-Brain queue, optionally fires GitHub relay workflows, Telegram summary to JB.',
    whyImportant: 'Feeds the Repo Manager queue — without this droid the dispatch board stays empty.',
    defaultEnabled: true,
  },
  {
    id: 'axon-mf-ad-tracker',
    title: 'Match Fit Ad Tracker Sync',
    scheduleLabel: 'Every 6 hours',
    cronUtc: '15 */6 * * *',
    workflowFile: 'axon-mf-ad-tracker.yml',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'Match Fit',
    droidRole: 'Ads',
    faceShape: 'square',
    axonTools: ['Match Fit Admin', 'AXON Management-Match Fit'],
    description:
      'Pulls live Meta + TikTok daily snapshots (AX-AD) into NI-Brain for Match Fit Ad Tracking.',
    howItWorks:
      'GitHub Actions loads Ads API keys from secrets/ni_platform_secrets, writes mf_ad_platform_daily_snapshots, Telegram cues only if keys missing.',
    whyImportant:
      'July $50 MF tests need spend/click truth so August winners are locked from real ROAS — not gut feel.',
    defaultEnabled: true,
  },
  {
    id: 'axon-local-model-daily',
    title: 'Local Daily Model Build',
    scheduleLabel: 'Mac cron · daily 7:00 AM local',
    cronUtc: null,
    workflowFile: 'axon-local-model-daily.mjs',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Model',
    faceShape: 'circle',
    axonTools: ['NI Outreach HQ', 'Follow-Up Engine'],
    description:
      'AX-MODEL-DAILY — Ollama (or heuristic) scoring loop that calibrates Phase 1 outreach without burning paid API quota.',
    howItWorks:
      'Mac cron runs npm run model:daily, probes Ollama, scores recent leads, writes axon_local_model_runs. HQ Phase 1 strip can trigger the same path.',
    whyImportant:
      'Moves daily score/follow-up interactivity into AXON so JB spends less on cloud LLM subscriptions for routine calibration.',
    defaultEnabled: true,
  },
  {
    id: 'axon-wisdom-loop',
    title: 'Wisdom Absorb Loop',
    scheduleLabel: 'Mac cron · daily 6:30 AM local',
    cronUtc: null,
    workflowFile: 'axon-wisdom-loop.mjs',
    workflowRepo: 'northsideventuresllc-sketch/AXON',
    venture: 'AXON',
    droidRole: 'Learning',
    faceShape: 'hex',
    axonTools: ['Briefing Panel', 'NI Outreach HQ'],
    description:
      'AX-WISDOM-LOOP — Watch→digest→enhance absorb of ND corpus, research, Learnings, and signals into durable wisdom.',
    howItWorks:
      'Mac cron runs npm run wisdom, ranks multi-source wisdom, enhances J-space, upserts axon_wisdom_items + axon_wisdom_runs. Chat loads the prompt block.',
    whyImportant:
      'Slow Takeover / Mac ON path — AXON keeps JB corrections and verified ND principles without re-deriving them every session.',
    defaultEnabled: true,
  },
];

export function getCronJobDef(id: string): AxonCronJobDef | undefined {
  return AXON_CRON_CATALOG.find((j) => j.id === id);
}

/** Rough next-run estimate from cron (UTC). Returns null when no schedule. */
export function estimateNextRunUtc(cronUtc: string | null, from = new Date()): Date | null {
  if (!cronUtc) return null;
  const parts = cronUtc.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const [minField, hourField, , , dowField] = parts;
  const start = new Date(from.getTime() + 60_000);

  for (let i = 0; i < 60 * 24 * 14; i++) {
    const d = new Date(start.getTime() + i * 60_000);
    const min = d.getUTCMinutes();
    const hour = d.getUTCHours();
    const dow = d.getUTCDay();

    if (!matchCronField(minField, min)) continue;
    if (!matchCronField(hourField, hour)) continue;
    if (dowField !== '*' && !matchCronField(dowField, dow)) continue;
    return d;
  }
  return null;
}

function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    return step > 0 && value % step === 0;
  }
  return field.split(',').some((part) => {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      return value >= a && value <= b;
    }
    return Number(part) === value;
  });
}

export type AxonCronJobView = AxonCronJobDef & {
  enabled: boolean;
  scheduled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunSummary: string | null;
  nextRunAt: string | null;
  warnings: string[];
};
