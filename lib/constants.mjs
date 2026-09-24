export const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
export const SOURCE = 'axon_ni_services';
/**
 * Portal-side callers depend on this (src/app/axon/u/[username]/tools/mf-outreach/page.tsx
 * imports it from '@/lib/axon/constants.mjs'). It existed only in the portal copy, so the
 * next sync-ni-portal run would have overwritten it away and broken the NI-Portal build —
 * the exact shape of HEALTH-PORTAL-SYNC-DELETES / commit 7d4e12e. Caught by
 * scripts/lib/portal-delete-guard.mjs on 2026-08-04 before it shipped. Ported here so the
 * sync is a no-op for this symbol.
 */
export const MATCH_FIT_SOURCE = 'match_fit';
export const MAX_DRAFTS_PER_DAY = 15;
/**
 * PREFERRED hints only, NOT authoritative — NO-DEAD-MODELS (2026-09-24, AG-VERIFY-CHAIN-
 * EXHAUSTION-0924). Any caller that needs an actual model id to call should go through
 * resolveGeminiModelsLive() (or lib/model-resolve.mjs directly), which validates these
 * against Google's live ListModels catalog and substitutes the newest live flash model when
 * a pin here has been retired. These two constants are kept only as the "last resort, no
 * catalog reachable" pins and as an env override surface.
 *
 * gemini-1.5-flash was dropped from the default fallback list here (previously first
 * fallback) — sessions with live discovery available never call it unverified; sessions
 * without a catalog now fall through to gemini-2.5-pro rather than an id that may no longer
 * be listed. Set GEMINI_FALLBACK_MODELS to restore it if a specific deploy still needs it.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
/** Ordered fallbacks when primary returns hard quota / 404 / empty, catalog-unavailable path only. */
export const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.5-pro')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Resolve unique Gemini model cascade (primary + fallbacks), catalog-unaware. Kept for
 * callers that cannot await (or don't have a supabaseKey/apiKey handy) and for the
 * catalog-unavailable path — see resolveGeminiModelsLive for the live-verified version.
 */
export function resolveGeminiModels(primary) {
  const ordered = [primary || GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];
  return [...new Set(ordered.filter(Boolean))];
}

/**
 * Live-verified cascade: primary + fallbacks, reordered/filtered against Google's live
 * ListModels catalog when reachable (newest stable flash first), degrading to
 * resolveGeminiModels()'s unverified list when it is not. Never throws.
 */
export async function resolveGeminiModelsLive(primary, { apiKey, supabaseKey } = {}) {
  const { resolveModelChain } = await import('./model-resolve.mjs');
  const chain = await resolveModelChain('gemini', {
    preferred: primary || GEMINI_MODEL,
    configured: GEMINI_FALLBACK_MODELS,
    apiKey,
    supabaseKey,
  });
  return chain.length ? chain : resolveGeminiModels(primary);
}

export {
  ICP,
  MIN_OUTREACH_SCORE,
  SEARCH_QUERIES,
  pickQueriesForDay,
  serpQueryWithNegatives,
  SCORE_RUBRIC,
} from './icp-config.mjs';

import { MIN_OUTREACH_SCORE } from './icp-config.mjs';

/** @deprecated use MIN_OUTREACH_SCORE */
export const MIN_SCORE = MIN_OUTREACH_SCORE;

export const SERVICES_CATALOG = `
SMB ($4,500–$15,000):
- Workflow Integration & Automation
- Intelligence Audit & Gap Analysis
- Team Intelligence Training

Enterprise ($12,000–$100,000+):
- Tailored Intelligence Server
- Enterprise AI Strategy
- AI Governance & Compliance Framework
`.trim();

export function todayUtc() {
  return new Date().toISOString().split('T')[0];
}

export function shortId(uuid) {
  return String(uuid).replace(/-/g, '').slice(0, 8);
}

export function parseNotes(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return typeof parsed === 'object' && parsed ? parsed : { raw: notes };
  } catch {
    return { raw: notes };
  }
}

export function formatNotes(meta) {
  return JSON.stringify(meta);
}
