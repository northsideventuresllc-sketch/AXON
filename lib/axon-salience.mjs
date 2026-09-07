/**
 * AX-SALIENCE-DECAY (BPA-C2-BRAIN-GAPS-0906, part c) — wisdom salience never
 * decayed: every row absorbed by lib/wisdom-absorb-loop.mjs kept its salience
 * forever, so a correction from six months ago outranked something reinforced
 * yesterday purely because nothing ever went down. This is the missing decay
 * math, kept pure/testable (no DB, no fetch) — scripts/axon-salience-decay.mjs
 * is the thing that actually reads/writes `axon_wisdom_items` via REST.
 *
 * Exponential decay on time-since-last-reinforced, half-life in days, floored
 * so a row never fully vanishes (it can still be found, just deprioritized —
 * deleting a wisdom row outright is a separate, human decision).
 */

export const DEFAULT_SALIENCE_HALF_LIFE_DAYS = 14;
export const SALIENCE_FLOOR = 0.05;
export const DEFAULT_REINFORCEMENT_BUMP = 0.5;
export const SALIENCE_CEILING = 10;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A row is only as decayable as its timestamp: last_reinforced_at wins, falling
 * back to updated_at / absorbed_at / created_at for rows written before a real
 * last_reinforced_at column exists (that column is itself a follow-up — see
 * scripts/axon-salience-decay.mjs's header). A row with no usable timestamp at
 * all decays as if reinforced right now (age 0) — never decayed on a guess.
 */
function lastReinforcedMs(row) {
  const raw = row.last_reinforced_at || row.updated_at || row.absorbed_at || row.created_at || null;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Exponential decay: salience(t) = salience0 * 0.5 ^ (ageDays / halfLifeDays),
 * floored at SALIENCE_FLOOR. Pure — returns a NEW array, never mutates `rows`.
 *
 * @param {Array<{salience?: number, last_reinforced_at?: string, updated_at?: string, absorbed_at?: string, created_at?: string, fingerprint?: string, id?: string}>} rows
 * @param {Date|number|string} now
 * @param {number} [halfLifeDays]
 * @returns {Array<object>} same rows, each with a decayed `salience` and an
 *   added `decayed_from` (the pre-decay value) — sorted by decayed salience
 *   desc, ties broken by the ORIGINAL input order (stable) so re-running decay
 *   on an already-stable ranking never reshuffles ties.
 */
export function decaySalience(rows = [], now = new Date(), halfLifeDays = DEFAULT_SALIENCE_HALF_LIFE_DAYS) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const hl = Number(halfLifeDays) > 0 ? Number(halfLifeDays) : DEFAULT_SALIENCE_HALF_LIFE_DAYS;

  const decayed = rows.map((row, idx) => {
    const salience0 = Number(row.salience) || 0;
    const ts = lastReinforcedMs(row);
    const ageDays = ts == null ? 0 : Math.max(0, (nowMs - ts) / MS_PER_DAY);
    const factor = Math.pow(0.5, ageDays / hl);
    const decayedSalience = Math.max(SALIENCE_FLOOR, round2(salience0 * factor));
    return { ...row, salience: decayedSalience, decayed_from: salience0, _origIndex: idx };
  });

  // Stable sort desc by decayed salience; equal salience keeps original order.
  decayed.sort((a, b) => b.salience - a.salience || a._origIndex - b._origIndex);
  return decayed.map(({ _origIndex, ...rest }) => rest);
}

/**
 * Reinforcement bump — a row that gets re-surfaced/re-cited resets its decay
 * clock (last_reinforced_at = now) and gains a small salience bump, capped at
 * SALIENCE_CEILING so repeated reinforcement can't run away unboundedly. Pure.
 *
 * @param {object} row
 * @param {{ now?: Date|number|string, bump?: number }} [opts]
 */
export function reinforceSalience(row, opts = {}) {
  const { now = new Date(), bump = DEFAULT_REINFORCEMENT_BUMP } = opts;
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const salience0 = Number(row.salience) || 0;
  const bumped = Math.min(SALIENCE_CEILING, round2(salience0 + Number(bump)));
  return { ...row, salience: bumped, last_reinforced_at: nowIso };
}
