/**
 * AXON FIRE gate — TypeScript surface for Next.js routes.
 *
 * Runtime logic lives in `./axon-fire-gate-core.mjs` (plain JS) so it can also
 * be imported directly by raw Node scripts (`scripts/*.mjs`,
 * `lib/telegram-handler.mjs`) that run under GitHub Actions without a
 * TypeScript loader. This file just re-exports the runtime + adds types.
 */
export {
  FIRE_GATE_SECRET_KEY,
  FIRE_BLOCKED_ACTIONS,
  getFireMode,
  setFireMode,
  FireHoldError,
  assertFireAllowed,
  isFireAllowed,
} from './axon-fire-gate-core.mjs';

export type FireMode = 'HOLD' | 'FIRE';

export interface FireGateState {
  mode: FireMode;
  /** Where the resolved mode came from. */
  source: 'env' | 'ni-brain' | 'default';
  blocked: { id: string; label: string; detail: string }[];
}
