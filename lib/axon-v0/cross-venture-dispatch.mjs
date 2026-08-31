/**
 * AXON usability item #6 (cross-venture dispatch) — pure validation for "hand this task
 * to an agent in a DIFFERENT venture" before it ever reaches fireAgent().
 *
 * This is deliberately a separate, pure gate from checkLoopGuards() in
 * lib/axon-agent-bus.mjs — that one guards fan-out shape (depth/hops/cycles) for ANY
 * fire, agent-to-agent or operator-initiated. This one guards the thing item #6 actually
 * asked for: the target must genuinely be in another venture, not the same one dressed up
 * as a "dispatch" (same-venture already has a chat box for that). Never re-implements or
 * relaxes checkLoopGuards' rules — the caller runs both, in this order, then calls the one
 * real fireAgent() path.
 *
 * Pure, no I/O — cheap and deterministic to unit test, same reasoning as
 * checkLoopGuards/scoreLanes.
 *
 * Run: node tests/cross-venture-dispatch.test.mjs
 */

/**
 * @param {object} p
 * @param {{id: string, venture_id: string, name?: string}|null} p.fromAgent
 * @param {{id: string, venture_id: string, name?: string}|null} p.toAgent
 * @param {string} p.task
 * @returns {{allowed: boolean, reason: string|null}}
 */
export function validateCrossVentureDispatch({ fromAgent, toAgent, task }) {
  if (!task || typeof task !== 'string' || !task.trim()) {
    return { allowed: false, reason: 'no task given' };
  }
  if (!fromAgent || !fromAgent.id) {
    return { allowed: false, reason: 'unknown sending agent' };
  }
  if (!toAgent || !toAgent.id) {
    return { allowed: false, reason: 'unknown target agent' };
  }
  if (fromAgent.id === toAgent.id) {
    return { allowed: false, reason: 'an agent cannot dispatch to itself' };
  }
  if (!toAgent.venture_id || !fromAgent.venture_id) {
    return { allowed: false, reason: 'both agents must belong to a venture' };
  }
  if (fromAgent.venture_id === toAgent.venture_id) {
    return {
      allowed: false,
      reason: 'same venture — use the venture room chat directly instead of cross-venture dispatch',
    };
  }
  return { allowed: true, reason: null };
}
