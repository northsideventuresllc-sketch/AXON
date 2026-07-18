/**
 * AXON step learner — write one learning per operator action, at every step.
 *
 * The goal is for AXON to learn from every meaningful interaction across the new
 * tools (Content Machine, Fire gate, Reddit queues, Usage Tower, Lucielle) and
 * NI Outreach — WITHOUT enabling any FIRE automation. Recording a step never
 * sends, publishes, or fires anything; it only appends a one-line signal.
 *
 * Primary sink is the NI-Brain `Learnings` table (`project`, `category`,
 * `source`, `learning`, `date`) — the same table the AX-WISDOM-LOOP already
 * reads from, so these events feed durable wisdom. When a real UUID resource id
 * is supplied we also mirror the event into `axon_tool_edit_signals` (the
 * established outreach-style signal table) so tool-specific summaries can pick
 * it up.
 *
 * Every call is fire-and-forget and swallows all errors. Learning must never
 * block UX or surface an error to the client.
 */
import { createSupabaseClient } from './supabase.mjs';
import { OPERATOR_ID } from './axon-types';

const LEARNINGS_TABLE = 'Learnings';
const SIGNALS_TABLE = 'axon_tool_edit_signals';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StepLearnEvent {
  /** Tool / surface the step happened in, e.g. `content-machine`, `fire-gate`. */
  tool: string;
  /** The step / action, e.g. `approve`, `edit`, `mode-change`, `cap-change`. */
  step: string;
  /** Value before the change (optional). */
  before?: unknown;
  /** Value after the change (optional). */
  after?: unknown;
  /** Venture this relates to — becomes the `Learnings.project` (default AXON). */
  venture?: string;
  /** Extra structured context — folded into the one-line summary. */
  meta?: Record<string, unknown>;
  /** Operator id for the signal mirror (defaults to the shared operator). */
  operatorId?: string;
  /**
   * True when the step was blocked by the HOLD gate. Blocks are still learned
   * from — they tell AXON what the operator tried to fire.
   */
  hold?: boolean;
  /**
   * Optional resource id. When a valid UUID, the event is also mirrored into
   * `axon_tool_edit_signals` (which requires a UUID `resource_id`).
   */
  resourceId?: string;
}

function getSupabaseKey(): string {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/** Collapse an arbitrary value to a short, single-line, safe string. */
function short(value: unknown, max = 140): string {
  if (value == null) return '';
  let str: string;
  if (typeof value === 'string') str = value;
  else if (typeof value === 'number' || typeof value === 'boolean') str = String(value);
  else {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  }
  str = str.replace(/\s+/g, ' ').trim();
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/** Build a compact one-line learning string from a step event. */
export function buildLearningLine(event: StepLearnEvent): string {
  const parts: string[] = [];
  parts.push(`[${event.tool}] ${event.step}`);
  if (event.hold) parts.push('(HOLD — blocked)');
  const before = short(event.before);
  const after = short(event.after);
  if (before && after) parts.push(`${before} → ${after}`);
  else if (after) parts.push(`→ ${after}`);
  else if (before) parts.push(`was: ${before}`);
  if (event.meta && Object.keys(event.meta).length) {
    const metaBits = Object.entries(event.meta)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}=${short(v, 60)}`);
    if (metaBits.length) parts.push(`{${metaBits.join(', ')}}`);
  }
  return short(parts.join(' '), 480);
}

/**
 * Record a single learning event. Awaitable, but callers should treat it as
 * fire-and-forget via {@link learnStep}. Never throws.
 */
export async function recordStepLearning(event: StepLearnEvent): Promise<boolean> {
  const key = getSupabaseKey();
  // No key (local / preview) → no-op, still safe.
  if (!key || !event?.tool || !event?.step) return false;

  const learning = buildLearningLine(event);
  const project = event.venture && event.venture.trim() ? event.venture.trim() : 'AXON';
  const nowIso = new Date().toISOString();

  try {
    const { sbInsert } = createSupabaseClient(key);

    await sbInsert(LEARNINGS_TABLE, {
      date: nowIso,
      learning,
      source: `axon:${event.tool}`,
      category: `step:${event.step}${event.hold ? ':hold' : ''}`,
      project,
    });

    // Mirror into the outreach-style signal table only when we have a real UUID
    // resource id (the column is UUID-typed and would reject anything else).
    if (event.resourceId && UUID_RE.test(event.resourceId)) {
      try {
        await sbInsert(SIGNALS_TABLE, {
          tool_slug: event.tool,
          resource_type: 'step',
          resource_id: event.resourceId,
          field_name: event.step,
          before_value: event.before == null ? null : short(event.before, 500),
          after_value: event.after == null ? null : short(event.after, 500),
          operator_id: event.operatorId || OPERATOR_ID,
        });
      } catch {
        /* signal mirror is best-effort */
      }
    }
    return true;
  } catch {
    // Learning is best-effort — never surface an error.
    return false;
  }
}

/**
 * Fire-and-forget learner. Safe to call from any request handler without
 * awaiting — it will never throw and never block the response.
 */
export function learnStep(event: StepLearnEvent): void {
  void recordStepLearning(event).catch(() => {});
}
