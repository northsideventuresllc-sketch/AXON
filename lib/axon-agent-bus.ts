/**
 * Typed wrapper over the agent bus core.
 *
 * Same split as lib/axon-fire-gate.ts / lib/axon-fire-gate-core.mjs and
 * lib/axon-router.ts / lib/axon-router-core.mjs: the runtime lives in plain .mjs so raw
 * `node` scripts (tests/*.test.mjs) can import it with no TS loader, and this file gives
 * the Next.js/TS side types. Never re-implements fireAgent() or its loop guards here —
 * every caller (including app/api/axon-v0/dispatch/route.ts) goes through the one export.
 */
export {
  fireAgent,
  checkLoopGuards,
  classifyGatedAction,
  MAX_FANOUT_DEPTH,
  MAX_HOPS_PER_REQUEST,
  DEFAULT_FIRE_CHAIN_BUDGET_MS,
} from './axon-agent-bus.mjs';

export interface FireAgentResult {
  ok: boolean;
  resolved?: boolean;
  reason?: string;
  gated?: string | null;
  messageId?: string;
  replyMessageId?: string | null;
  busId?: string;
  requestId?: string;
  depth?: number;
  hopCount?: number;
  reply?: string;
  route?: string;
  capabilityClass?: string;
  tool?: unknown;
}
