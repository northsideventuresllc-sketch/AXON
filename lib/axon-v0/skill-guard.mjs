/**
 * SKILLS & MCP toggle guard — problem #8's safety rule, isolated as a pure
 * function so it is cheap to test and impossible for a UI-layer bug to bypass.
 *
 * Plain .mjs on purpose, same reasoning as axon-fire-gate-core.mjs and
 * axon-agent-bus.mjs: this has to run under both Next.js/TS (imported from
 * app/api/axon-v0/skills/route.ts) and raw `node` with no TS loader (this
 * file's own test, tests/skill-guard.test.mjs).
 *
 * JB standing order (nv-vault CLAUDE.md, obsidian-vault-write skill
 * frontmatter, 2026-08-13): `obsidian-vault-write` is GOLDEN and must NEVER
 * be removed or deactivated under any circumstance. That name is hardcoded
 * below as a second, independent check — it fires even if a future data bug
 * ever left `is_golden` false on that row. Defense in depth on purpose.
 */

// Names that can never be disabled, full stop, no override — checked by name
// regardless of what the registry row's `is_golden` flag currently says.
// Frozen: a plain array can be emptied in-process (`L.length = 0`), which would
// re-enable disabling the one skill JB ordered can never be turned off. Not reachable
// by an API caller, but the guarantee should not depend on that.
export const HARD_LOCKED_GOLDEN_SKILLS = Object.freeze(['obsidian-vault-write']);

/**
 * Decide whether a requested enable/disable toggle is allowed.
 *
 * @param {object} args
 * @param {string} args.name - skill name as stored in nvg_skill_registry.
 * @param {boolean} args.isGolden - the row's is_golden flag.
 * @param {boolean} args.nextEnabled - the state the toggle is asking for.
 * @param {boolean} [args.confirmGolden] - true once the caller has passed an
 *   explicit second confirmation for a golden (but not hard-locked) skill.
 * @returns {{ allowed: boolean, reason?: string, requiresConfirm?: boolean }}
 */
export function assertSkillToggleAllowed({ name, isGolden, nextEnabled, confirmGolden }) {
  const key = String(name || '').trim().toLowerCase();

  // Turning a skill ON is always allowed — the footgun is only ever disabling one.
  if (nextEnabled) return { allowed: true };

  if (HARD_LOCKED_GOLDEN_SKILLS.includes(key)) {
    return {
      allowed: false,
      reason: `"${name}" is a golden skill under a standing order that it can never be turned off — it loads on every agent boot and stays on no matter what.`,
    };
  }

  if (isGolden && !confirmGolden) {
    return {
      allowed: false,
      requiresConfirm: true,
      reason: `"${name}" is a golden skill — it loads for every agent on every boot. Confirm you really mean to turn off a golden skill before this takes effect.`,
    };
  }

  return { allowed: true };
}
