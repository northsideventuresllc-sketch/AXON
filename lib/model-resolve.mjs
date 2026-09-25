/**
 * NO-DEAD-MODELS resolver (2026-09-24, JB live requirement): a single choke point every
 * caller that used to hardcode a model id should go through instead. Wraps the live
 * discovery in lib/axon-model-discovery.mjs (from PR #260 — getLiveModels + buildCandidates)
 * so a "preferred" id (the old hardcoded constant) is used only when the provider's live
 * catalog still has it, and otherwise the newest live model in that family is picked
 * automatically. If the catalog cannot be fetched at all, this NEVER throws — it returns
 * the preferred id as-is, same as the pre-discovery behaviour.
 *
 * This module holds no network code of its own; it is a thin, testable layer over
 * getLiveModels()/buildCandidates() so lib/constants.mjs, lib/axon-computer-use.mjs and any
 * other single-model caller stop hardcoding ids directly.
 */

import { getLiveModels, buildCandidates } from './axon-model-discovery.mjs';

/**
 * Family -> how to pick "newest in family" out of a live-ranked candidate list.
 * Each live list from axon-model-discovery.mjs is already ranked newest/best-first for its
 * provider, so "newest in family" is just "first candidate whose id matches the family's
 * sub-filter" (e.g. anthropic's sonnet family within a list that also has haiku ids).
 */
const FAMILY_FILTERS = {
  'gemini-flash': (id) => /flash/i.test(id) && !/pro/i.test(id),
  'anthropic-sonnet': (id) => /sonnet/i.test(id),
  'anthropic-haiku': (id) => /haiku/i.test(id),
};

/**
 * Resolve a single model id for one caller.
 *
 * @param {'gemini'|'openrouter'|'anthropic'|'ollama'} provider
 * @param {{
 *   preferred?: string,           // the old hardcoded id — used as a pin if live
 *   family?: keyof FAMILY_FILTERS,// narrows "newest in family" (e.g. 'anthropic-sonnet')
 *   apiKey?: string,
 *   supabaseKey?: string,
 *   base?: string,                // ollama only
 *   cachedOnly?: boolean,
 * }} [opts]
 * @returns {Promise<string|null>} a model id, or `preferred` (possibly null) if no catalog
 *   is reachable and no live-verified id could be picked.
 */
export async function resolveModel(provider, opts = {}) {
  const { preferred = null, family = null, apiKey, supabaseKey, base, cachedOnly = false } = opts;

  let live = null;
  try {
    live = await getLiveModels(provider, { apiKey, supabaseKey, base, cachedOnly });
  } catch {
    live = null; // never throw — degrade to `preferred`
  }

  if (!live || !live.length) {
    // Catalog unavailable: keep old behaviour exactly — return the preferred id unverified.
    return preferred;
  }

  const filter = family && FAMILY_FILTERS[family] ? FAMILY_FILTERS[family] : null;
  const scoped = filter ? live.filter(filter) : live;

  // buildCandidates puts a live-verified `preferred` first, then the rest of the live list
  // (already newest-first per provider ranking); scoped-but-empty falls back to the full list
  // so a bad family filter degrades to "newest overall" rather than null.
  const pool = scoped.length ? scoped : live;
  const candidates = buildCandidates({ live: pool, pins: preferred ? [preferred] : [], provider });

  return candidates[0] || preferred || null;
}

/**
 * Convenience wrapper for the very common "one preferred id, ordered fallback list" shape
 * (what lib/constants.mjs's GEMINI_MODEL / GEMINI_FALLBACK_MODELS used to do by hand). Returns
 * an ordered, deduped list: live-verified preferred + configured fallbacks first, then
 * whatever else the live catalog offers, newest first. Never empty when `preferred` is set
 * and never throws.
 */
export async function resolveModelChain(provider, { preferred, configured = [], ...rest } = {}) {
  let live = null;
  try {
    live = await getLiveModels(provider, rest);
  } catch {
    live = null;
  }
  if (!live || !live.length) {
    return [...new Set([preferred, ...configured].filter(Boolean))];
  }
  return buildCandidates({ live, pins: preferred ? [preferred] : [], configured, provider });
}
