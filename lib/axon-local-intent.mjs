/**
 * LOCAL-FIRST model choice for the chain's `local` tier (Mac mini Ollama).
 *
 * Ported from nv-vault scripts/lib/axon-llm.mjs (`classifyIntent` / `resolveSpecializedLocalModel`,
 * Antigravity 2026-09-23), which only ever applied when the caller ran ON the mini. Here it applies
 * to every local-tier call the AXON router makes, with one hard rule the original lacked:
 *
 *   a task-specialized model is chosen ONLY when it is in the live installed-models list
 *   (Ollama /api/tags, via lib/axon-model-discovery.mjs). Otherwise axon-ornith, and failing
 *   that, any installed AXON model — never a blind call to a model the mini may not have.
 *
 * Goal (JB, Decision #2001): the free local tier answers first so paid RunPod stays unneeded.
 * Pure functions only — no I/O — so every route is unit-testable with a mocked installed list.
 */

export const DEFAULT_LOCAL_MODEL = 'axon-ornith:latest';

/** Fast (<1ms) keyword heuristic. Same rules and order as nv-vault axon-llm.mjs. */
export function classifyIntent(promptText = '', systemText = '') {
  const combined = `${systemText || ''} ${promptText || ''}`;
  if (/\b(json|extract|parse|schema|format as|convert to json|key-value)\b/i.test(combined)) {
    return 'extraction';
  }
  if (/```|\b(function\b|def\s+|const\s+|let\s+|var\s+|class\s+|import\s+|export\s+|public\s+|interface\s+|typedef\s+|SELECT\s+.+\s+FROM\b)/i.test(combined)) {
    return 'code';
  }
  if (/\b(compare|trade-offs|why|architecture|reasoning|evaluate|critique|pros and cons|analyze|consensus)\b/i.test(combined)) {
    return 'reasoning';
  }
  return 'general';
}

/**
 * Intent for a chain call. An explicit caller `kind` that names a specialty wins over the
 * prompt heuristic (e.g. kind='council_review' → reasoning); the router's generic default
 * kind ('cheap_chat') and anything unrecognized fall back to classifying the prompt text.
 */
export function resolveLocalIntent(kind, userText = '', systemText = '') {
  const k = String(kind || '').toLowerCase();
  if (k === 'code' || /coder|sql|script|code_/.test(k)) return 'code';
  if (k === 'reason' || k === 'reasoning' || /council|audit|review|critique/.test(k)) return 'reasoning';
  if (k === 'extraction' || k === 'fast' || /json|format|extract|classif/.test(k)) return 'extraction';
  return classifyIntent(userText, systemText);
}

/** The task-specialized small model for an intent, or null for 'general'. Env overrides win. */
export function specializedModelFor(intent, env = process.env) {
  if (intent === 'code') return env.AXON_CODE_MODEL || 'qwen2.5-coder:1.5b';
  if (intent === 'reasoning') return env.AXON_REASON_MODEL || 'deepseek-r1:1.5b';
  if (intent === 'extraction') return env.AXON_FAST_MODEL || 'qwen2.5:0.5b';
  return null;
}

/** Ollama treats `name` and `name:latest` as the same model. */
function sameModel(a, b) {
  const norm = (s) => (String(s).includes(':') ? String(s) : `${s}:latest`);
  return norm(a) === norm(b);
}

function findInstalled(installed, id) {
  return installed.find((m) => sameModel(m, id)) || null;
}

/**
 * Ordered local candidates for one call.
 *
 * @param {object} a
 * @param {string} a.intent - from resolveLocalIntent
 * @param {string[]|null} a.installed - live installed list, or null when unknown
 * @param {string[]} [a.configured] - router_models ids for the local route (pins)
 * @param {object} [a.env]
 * @returns {{ candidates: string[], specialized: string|null, reason: string }}
 *   reason is a short machine-readable tag for metrics:
 *     'specialized'              – specialized model installed and placed first
 *     'specialized_not_installed'– wanted one, the live list lacks it → default first
 *     'installed_unknown'        – no live list → old behaviour (configured/default only)
 *     'general'                  – no specialty for this prompt
 */
export function pickLocalModelCandidates({ intent, installed, configured = [], env = process.env }) {
  const defaultModel = env.AXON_LOCAL_MODEL || DEFAULT_LOCAL_MODEL;
  const wanted = specializedModelFor(intent, env);
  const cfg = configured.filter(Boolean).map(String);

  // No live list: never gamble on a specialized model. Same order the tier used before.
  if (!Array.isArray(installed) || !installed.length) {
    const base = cfg.length ? cfg : [defaultModel];
    return {
      candidates: dedupe(base),
      specialized: null,
      reason: wanted ? 'installed_unknown' : 'general',
    };
  }

  const ordered = [];
  let reason = wanted ? 'specialized_not_installed' : 'general';
  let specialized = null;
  if (wanted) {
    const hit = findInstalled(installed, wanted);
    if (hit) {
      ordered.push(hit);
      specialized = hit;
      reason = 'specialized';
    }
  }
  const def = findInstalled(installed, defaultModel);
  if (def) ordered.push(def);
  for (const id of cfg) {
    const hit = findInstalled(installed, id);
    if (hit) ordered.push(hit);
  }
  // Any installed AXON model next (axon-ornith:canary, axon-llama, …), then everything else
  // installed as a last local resort — still free, still local, still beats a paid tier.
  for (const m of installed) if (String(m).startsWith('axon-')) ordered.push(m);
  for (const m of installed) ordered.push(m);
  return { candidates: dedupe(ordered), specialized, reason };
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => !seen.has(x) && seen.add(x));
}
