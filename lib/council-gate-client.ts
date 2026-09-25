/**
 * council-gate-client.ts — TypeScript surface for Next.js/AXON code.
 *
 * Runtime logic lives in `./council-gate-client-core.mjs` (plain JS) so it
 * can also be imported directly by raw Node scripts and `node --test`
 * without a TypeScript loader (same pattern as lib/axon-fire-gate.ts /
 * lib/axon-fire-gate-core.mjs). This file just re-exports the runtime.
 *
 * See council-gate-client-core.mjs for the full contract, env vars, and the
 * "never merge, only request review" rule.
 */
export {
  getSupabaseUrl,
  getServiceKey,
  requestCouncilGateReview,
} from './council-gate-client-core.mjs';
