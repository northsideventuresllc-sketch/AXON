/**
 * AXON DROID RUNNER TARGET (2026-09-24, scoping slice for BUILD ticket
 * b196ed62-d95c-4b32-8c00-5db57daf0c90 — "Ghost Desktop runner, credential vault and live
 * screen streaming") — a single, honestly-labeled routing seam for where a computer-use run
 * executes.
 *
 * THIS FILE IS A STUB. It adds no isolation and no credential handling. Today the only real
 * runner is JB's live physical Mac mini session (lib/axon-computer-use.mjs, via
 * lib/nvg-mini-queue.mjs) — that behavior is unchanged. This module exists only so a future
 * Ghost Desktop implementation has one call site to land behind, instead of a routing
 * decision getting improvised ad hoc inside axon-computer-use.mjs later.
 *
 * See docs/axon-droid-ghost-desktop-and-credential-vault-scoping.md for the full
 * architecture/scoping plan, including why the credential vault piece is NOT started here —
 * it is hard-stop-adjacent and needs JB's explicit sign-off on the security design first.
 *
 * Fails closed on purpose: requesting the not-yet-built target throws immediately rather
 * than silently falling back to the live session (which would be a correctness bug, not a
 * safe default) or silently no-op'ing (same fail-closed shape as the unmatched-shell-payload
 * guard in lib/nvg-mini-risk-gate.mjs).
 */

export const RUNNER_TARGETS = Object.freeze({
  LIVE_SESSION: 'live_session',
  GHOST_DESKTOP: 'ghost_desktop',
});

/**
 * Decide which runner target a computer-use run should execute against.
 *
 * @param {{ requestedTarget?: string }} [opts]
 * @returns {string} one of RUNNER_TARGETS's values
 * @throws if a target other than LIVE_SESSION is requested — none of them exist yet.
 */
export function resolveRunnerTarget(opts = {}) {
  const requested = opts.requestedTarget || RUNNER_TARGETS.LIVE_SESSION;

  if (requested === RUNNER_TARGETS.LIVE_SESSION) {
    return RUNNER_TARGETS.LIVE_SESSION;
  }

  if (requested === RUNNER_TARGETS.GHOST_DESKTOP) {
    throw new Error(
      'axon-droid-runner-target: ghost_desktop is not implemented yet. See ' +
        'docs/axon-droid-ghost-desktop-and-credential-vault-scoping.md — isolated-environment ' +
        'work is scoped but not built, and the credential vault it would need is a hard-stop ' +
        'item pending JB sign-off on the security design. Falling back to live_session is not ' +
        'done automatically because that would silently change which physical session a run ' +
        'touches.'
    );
  }

  throw new Error(`axon-droid-runner-target: unknown runner target "${requested}"`);
}
