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

// Sizes in billions of parameters for AXON's custom-tagged models (no `:<n>b` suffix).
// Base Ollama models (qwen2.5:0.5b, ornith:9b, ...) are parsed from their tag.
const KNOWN_LOCAL_MODEL_SIZE_B = {
  'axon-ornith': 9,
  'axon-llama': 3.2,
  'llama3.2': 3.2,
  'ornith': 9,
};

/**
 * Billions of parameters for a local model tag, or null when unknown.
 * Never excludes unknown models from size floors — only models positively confirmed undersized.
 */
export function localModelSizeB(name) {
  const s = String(name || '');
  const m = s.match(/[:-](\d+(?:\.\d+)?)b\b/i);
  if (m) return Number(m[1]);
  const base = s.split(':')[0].toLowerCase();
  return Object.prototype.hasOwnProperty.call(KNOWN_LOCAL_MODEL_SIZE_B, base) ? KNOWN_LOCAL_MODEL_SIZE_B[base] : null;
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
 * @param {number|null} [a.minLocalModelB] - drop candidates positively known to be smaller than
 *   this (billions of params); unknown-size candidates are kept.
 * @param {boolean} [a.fastest] - prioritize fastest passing models meeting the quality floor.
 * @param {boolean} [a.interactive] - alias/trigger for fastest mode when human is waiting live.
 * @returns {{ candidates: string[], specialized: string|null, reason: string }}
 *   reason is a short machine-readable tag for metrics:
 *     'specialized'              – specialized model installed and placed first
 *     'specialized_below_floor'  – specialized model installed but below minLocalModelB floor
 *     'specialized_not_installed'– wanted one, the live list lacks it → default first
 *     'below_floor_fallback'     – all models below floor, fell back to default
 *     'installed_unknown'        – no live list → old behaviour (configured/default only)
 *     'general'                  – no specialty for this prompt
 */
export function pickLocalModelCandidates({
  intent,
  installed,
  configured = [],
  env = process.env,
  minLocalModelB = null,
  fastest = false,
  interactive = false,
}) {
  const defaultModel = env.AXON_LOCAL_MODEL || DEFAULT_LOCAL_MODEL;
  const wanted = specializedModelFor(intent, env);
  const cfg = configured.filter(Boolean).map(String);
  const preferFastest = fastest || interactive;

  // No live list: never gamble on a specialized model. Same order the tier used before.
  if (!Array.isArray(installed) || !installed.length) {
    let base = cfg.length ? cfg : [defaultModel];
    if (minLocalModelB != null) {
      const meets = base.filter((m) => {
        const b = localModelSizeB(m);
        return b == null || b >= minLocalModelB;
      });
      base = meets.length ? meets : [defaultModel];
    }
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

  if (preferFastest && !wanted) {
    // When fastest is requested and no specialty was requested, put the fastest (smallest)
    // passing models before the 9B heavy default so interactive/fast calls don't hang 90s.
    const sortedInstalled = [...installed].sort((a, b) => {
      const sa = localModelSizeB(a) ?? 999;
      const sb = localModelSizeB(b) ?? 999;
      return sa - sb;
    });
    for (const m of sortedInstalled) ordered.push(m);
    if (def) ordered.push(def);
  } else {
    if (def) ordered.push(def);
    for (const id of cfg) {
      const hit = findInstalled(installed, id);
      if (hit) ordered.push(hit);
    }
    // Any installed AXON model next (axon-ornith:canary, axon-llama, …), then everything else
    // installed as a last local resort — still free, still local, still beats a paid tier.
    for (const m of installed) if (String(m).startsWith('axon-')) ordered.push(m);
    for (const m of installed) ordered.push(m);
  }

  let candidates = dedupe(ordered);

  // Apply quality floor (minLocalModelB)
  if (minLocalModelB != null) {
    const meetsFloor = candidates.filter((m) => {
      const b = localModelSizeB(m);
      return b == null || b >= minLocalModelB;
    });
    if (specialized && !meetsFloor.includes(specialized)) {
      specialized = null;
      reason = 'specialized_below_floor';
    }
    candidates = meetsFloor;
    if (!candidates.length) {
      candidates = [def || defaultModel];
      reason = 'below_floor_fallback';
    }
  }

  // If preferFastest is requested, ensure passing candidates are ordered by speed (size ascending),
  // keeping specialized first if it was valid.
  if (preferFastest && candidates.length > 1) {
    const first = (specialized && candidates.includes(specialized)) ? [specialized] : [];
    const rest = candidates.filter((c) => !first.includes(c));
    rest.sort((a, b) => {
      const sa = localModelSizeB(a) ?? 999;
      const sb = localModelSizeB(b) ?? 999;
      return sa - sb;
    });
    candidates = [...first, ...rest];
  }

  return { candidates: dedupe(candidates), specialized, reason };
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => !seen.has(x) && seen.add(x));
}
