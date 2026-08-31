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
