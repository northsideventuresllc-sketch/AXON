/**
 * Typed wrapper over the toolkit-build core.
 *
 * Same split as lib/axon-fire-gate.ts / lib/axon-fire-gate-core.mjs and
 * lib/axon-agent-bus.ts / lib/axon-agent-bus.mjs: runtime lives in plain .mjs so raw
 * `node` scripts (tests/*.test.mjs) can import it with no TS loader; this file gives the
 * Next.js/TS side types. Never re-implements requestToolkitBuild() or fireAgent() here.
 */
export { buildToolkitTask, requestToolkitBuild, TOOLKIT_BUILD_GATE_ACTION, FireHoldError } from './axon-toolkit-build.mjs';

export interface ToolkitBuildSpec {
  name: string;
  summary?: string;
  icon?: string;
  fields?: string[];
}

export interface ToolkitBuildResult {
  ok: boolean;
  held?: boolean;
  reason?: string;
  busId?: string | null;
  agentId?: string | null;
  state?: 'dispatched' | 'completed';
  reply?: string | null;
}
