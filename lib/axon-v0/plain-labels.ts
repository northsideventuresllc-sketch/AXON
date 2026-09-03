/**
 * Plain-English labels for the AGENTS board. Nothing rendered on screen from this
 * module should ever be a raw database status code, platform slug, or table name —
 * matches the standard set by `src/lib/axon/plain-labels.ts` in the sibling
 * northside-intelligence portal repo (STATUS_LABELS + de-underscore fallback).
 */

const PLATFORM_LABELS: Record<string, string> = {
  axon: 'AXON',
  claude_code_cloud: 'Claude Code',
  cowork_ccr: 'Local (Cowork)',
  cowork_local: 'Local (Cowork)',
};

function deJargon(raw: string): string {
  const spaced = raw.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : raw;
}

/** Lane title for a platform value. Unknown platforms fall back to a de-underscored,
 *  capitalized version rather than shouting the raw slug. */
export function plainPlatform(platform: string | null | undefined): string {
  const key = (platform || 'axon').toLowerCase().trim();
  return PLATFORM_LABELS[key] || deJargon(key) || 'Other Agents';
}

const HEALTH_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  ok: 'Healthy',
  green: 'Healthy',
  degraded: 'Needs attention',
  warning: 'Needs attention',
  yellow: 'Needs attention',
  down: 'Not responding',
  error: 'Not responding',
  failing: 'Not responding',
  unhealthy: 'Not responding',
  critical: 'Not responding',
  red: 'Not responding',
  unknown: 'Status unknown',
};

/** Short human line for a routine's raw `health_status`. */
export function plainHealth(status: string | null | undefined): string | undefined {
  if (!status) return undefined;
  const key = status.toLowerCase().trim();
  return HEALTH_LABELS[key] || deJargon(key);
}

const WAKE_LABELS: Record<string, string> = {
  cron: 'Scheduled',
  schedule: 'Scheduled',
  scheduled: 'Scheduled',
  webhook: 'Event-triggered',
  event: 'Event-triggered',
  poll: 'Polling',
  polling: 'Polling',
  manual: 'Manual',
};

/** Plain label for a routine's `wake_type`, used as the card's role/subtitle line. */
export function plainWakeType(wakeType: string | null | undefined): string | undefined {
  if (!wakeType) return undefined;
  const key = wakeType.toLowerCase().trim();
  return WAKE_LABELS[key] || deJargon(key);
}

const BLOCKED_HEALTH = new Set(['down', 'error', 'failing', 'unhealthy', 'critical', 'red']);

/** Maps a routine row's raw health signal onto the board's existing 4-state chip —
 *  never invents a 5th state; the UI only understands running/blocked/active/idle,
 *  and routines have no "currently executing" signal so they never report running. */
export function routineAgentStatus(
  active: boolean,
  healthStatus: string | null | undefined
): 'blocked' | 'active' | 'idle' {
  if (!active) return 'idle';
  const key = (healthStatus || '').toLowerCase().trim();
  return BLOCKED_HEALTH.has(key) ? 'blocked' : 'active';
}

const COMMS_SOURCE_LABELS: Record<string, string> = {
  bus: 'Agent Bus',
  slack: 'Slack',
  telegram: 'Telegram',
  task: 'Task Log',
};

/** Short chip label for a v_agent_comms_feed row's `source`. */
export function plainCommsSource(source: string | null | undefined): string {
  if (!source) return 'Unknown';
  const key = source.toLowerCase().trim();
  return COMMS_SOURCE_LABELS[key] || deJargon(key);
}

const COMMS_STATUS_LABELS: Record<string, string> = {
  open: 'Waiting',
  pending: 'Waiting',
  answered: 'Answered',
  resolved: 'Answered',
  dropped: 'Dropped',
  failed: 'Dropped',
};

/** Plain label for a comms-feed row's `status` — never the raw open/answered/dropped
 *  value on screen. */
export function plainCommsStatus(status: string | null | undefined): string | undefined {
  if (!status) return undefined;
  const key = status.toLowerCase().trim();
  return COMMS_STATUS_LABELS[key] || deJargon(key);
}

const FLEET_STATUS_LABELS: Record<string, string> = {
  live: 'Alive',
  stale: 'Quiet',
  never_seen: 'Never checked in',
  disabled_by_design: 'Off on purpose',
};

/** Plain label for v_fleet_live_status.status — never the raw LIVE/STALE/etc value. */
export function plainFleetStatus(status: string | null | undefined): string {
  if (!status) return 'Status unknown';
  const key = status.toLowerCase().trim();
  return FLEET_STATUS_LABELS[key] || deJargon(key);
}

const SURFACE_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  claude_code_cloud: 'Claude Code',
  axon_local: 'AXON Local',
  axon: 'AXON Local',
  github_actions: 'GitHub Actions',
  mac_mini: 'Mac Mini',
  cowork_ccr: 'Local (Cowork)',
  cowork_local: 'Local (Cowork)',
};

/** Plain label for a fleet row's `surface` — e.g. "claude_code" -> "Claude Code". */
export function plainSurface(surface: string | null | undefined): string {
  if (!surface) return 'Unknown';
  const key = surface.toLowerCase().trim();
  return SURFACE_LABELS[key] || deJargon(key);
}

const DISPATCH_STATE_LABELS: Record<string, string> = {
  dispatched: 'Sent',
  running: 'Working on it',
  completed: 'Done',
  timeout: 'Ran out of time',
  failed: 'Could not finish',
};

/** Plain label for a cross-venture dispatch's `body.progress.state` (agent_bus row) —
 *  never the raw dispatched/running/completed/timeout/failed enum on screen. */
export function plainDispatchState(state: string | null | undefined): string {
  if (!state) return 'Sent';
  const key = state.toLowerCase().trim();
  return DISPATCH_STATE_LABELS[key] || deJargon(key);
}

const TOOLKIT_BUILD_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  held: 'Waiting on the FIRE gate',
  dispatched: 'Build Manager is on it',
  completed: 'Build Manager replied',
};

/** Plain label for a CustomWidgetSpec.buildStatus (item #10) — never the raw
 *  draft/held/dispatched/completed value on screen. */
export function plainToolkitBuildStatus(status: string | null | undefined): string {
  if (!status) return 'Draft';
  const key = status.toLowerCase().trim();
  return TOOLKIT_BUILD_STATUS_LABELS[key] || deJargon(key);
}

/**
 * The five harnesses JB's Phase 2 order allows (agentic-os-phase2-harness-usage.md):
 * AXON v0, Claude Code, Mac mini, Hermes, Supabase cron. `nvg_agent_routines.harness`
 * still carries legacy values from before that consolidation (github_actions,
 * claude_code_routine, claude_code_repo_manager, axon_local) — this buckets a raw value
 * into one of the five for the Fleet panel's grouping, never inventing a 6th group.
 * `github_actions` buckets into 'hermes': the harness-cron-map research found "Hermes-as-
 * a-harness today is mostly GitHub Actions plus a Mac gateway" — these rows are
 * candidates for Phase A1's move off GitHub Actions, not yet moved.
 */
const HARNESS_BUCKET: Record<string, string> = {
  axon_local: 'axon_v0',
  axon_v0: 'axon_v0',
  claude_code_routine: 'claude_code',
  claude_code_repo_manager: 'claude_code',
  claude_code: 'claude_code',
  mac_mini: 'mac_mini',
  hermes: 'hermes',
  github_actions: 'hermes',
  supabase: 'supabase',
};

const HARNESS_BUCKET_LABELS: Record<string, string> = {
  axon_v0: 'AXON v0',
  claude_code: 'Claude Code',
  mac_mini: 'Mac Mini',
  hermes: 'Hermes',
  supabase: 'Supabase Cron',
  other: 'Unsorted',
};

/** Buckets a raw `nvg_agent_routines.harness` value into one of the five allowed
 *  harnesses (or 'other' for a null/unrecognized value — never silently dropped). */
export function rosterHarnessBucket(harness: string | null | undefined): string {
  if (!harness) return 'other';
  const key = harness.toLowerCase().trim();
  return HARNESS_BUCKET[key] || 'other';
}

/** Plain group title for a harness bucket key (see rosterHarnessBucket). */
export function plainHarnessBucket(bucket: string): string {
  return HARNESS_BUCKET_LABELS[bucket] || deJargon(bucket);
}

export type RosterHealthChip = 'Healthy' | 'Needs attention' | 'Broken' | 'Stale' | 'Archived';

const ROSTER_BROKEN = new Set(['broken', 'down', 'error', 'failing', 'unhealthy', 'critical', 'red']);
const ROSTER_ATTENTION = new Set(['degraded', 'warning', 'yellow']);

/**
 * The Fleet panel's health chip — exactly five states, never a raw health_status value.
 * retired_at wins over everything (Archived); otherwise: known-broken values -> Broken;
 * known-degraded values -> Needs attention; known-healthy -> Healthy; anything else
 * (including 'unknown') falls back to Stale when the row hasn't fired in over 3 days (or
 * has never fired) and Needs attention otherwise — 'unknown' is never shown as-is.
 */
export function rosterHealthChip(
  healthStatus: string | null | undefined,
  retiredAt: string | null | undefined,
  lastFiredAt: string | null | undefined
): RosterHealthChip {
  if (retiredAt) return 'Archived';
  const key = (healthStatus || '').toLowerCase().trim();
  if (key === 'healthy' || key === 'ok' || key === 'green') return 'Healthy';
  if (ROSTER_BROKEN.has(key)) return 'Broken';
  if (ROSTER_ATTENTION.has(key)) return 'Needs attention';

  const lastFiredMs = lastFiredAt ? new Date(lastFiredAt).getTime() : NaN;
  const staleMs = 3 * 24 * 60 * 60 * 1000;
  if (Number.isNaN(lastFiredMs) || Date.now() - lastFiredMs > staleMs) return 'Stale';
  return 'Needs attention';
}

const ROSTER_HEALTH_CHIP_CLASS: Record<RosterHealthChip, string> = {
  Healthy: 'cf-status-pill--live',
  'Needs attention': 'cf-status-pill--stale',
  Broken: 'cf-status-pill--broken',
  Stale: 'cf-status-pill--never',
  Archived: 'cf-status-pill--archived',
};

/** CSS modifier class (comms-feed.css) for a rosterHealthChip() value. */
export function rosterHealthChipClass(chip: RosterHealthChip): string {
  return ROSTER_HEALTH_CHIP_CLASS[chip] || 'cf-status-pill--never';
}

/** "Model · run mode" line for a roster row — never raw column names on screen. */
export function plainRunMode(
  llmProvider: string | null | undefined,
  model: string | null | undefined,
  wakeType: string | null | undefined
): string {
  const parts: string[] = [];
  if (model) parts.push(model);
  else if (llmProvider) parts.push(deJargon(llmProvider));
  const wake = plainWakeType(wakeType);
  if (wake) parts.push(wake);
  return parts.length ? parts.join(' · ') : 'No LLM';
}

/** Relative "last seen" line — never a raw ISO timestamp dump. */
export function plainRelativeTime(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return undefined;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
