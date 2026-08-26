/**
 * Prefer Mac nightly AXON models when present in Ollama tags.
 * Source of truth: nv-vault scripts/lib/axon-local-model-runs.mjs
 */
export const AXON_LOCAL_MODELS = ['axon-ornith:latest', 'axon-llama:latest'];

export function pickPreferredAxonModel(models = [], fallback = 'llama3.2') {
  const list = (models || []).map(String);
  for (const want of AXON_LOCAL_MODELS) {
    if (list.includes(want)) return want;
    const bare = want.replace(/:latest$/, '');
    const hit = list.find((m) => m === bare || m.startsWith(`${bare}:`));
    if (hit) return hit;
  }
  const anyAxon = list.find((m) => /^axon-/i.test(m));
  return anyAxon || fallback;
}

// 2026-08-26 (JB direct order -- "wire that in"): axon-ornith (9B, Qwen3.5, thinking-capable,
// 262K ctx) and axon-llama (3.2B, Llama, 131K ctx) are DIFFERENT base architectures and
// cannot be weight-merged. The real lever is routing by task complexity instead: simple/
// structured tasks (short classification, scoring, yes/no) go to the fast/cheap llama tag;
// anything needing real reasoning stays on ornith.
export const AXON_SIMPLE_MODEL = 'axon-llama:latest';
export const AXON_COMPLEX_MODEL = 'axon-ornith:latest';

function findAxonTag(list, want) {
  if (list.includes(want)) return want;
  const bare = want.replace(/:latest$/, '');
  return list.find((m) => m === bare || m.startsWith(`${bare}:`));
}

/**
 * Heuristic task-complexity classifier. Cheap, deterministic, no LLM call.
 * SIMPLE = short structured tasks (scoring, classification, single-field extraction).
 * COMPLEX = anything longer or matching a reasoning/multi-step signal.
 * @param {string} text
 * @returns {'simple'|'complex'}
 */
export function classifyTaskComplexity(text = '') {
  const s = String(text || '');
  if (s.length > 600) return 'complex';
  const reasoningSignals = /(reason|plan|analyz|compare|explain why|multi-step|strategy|debug|why does|architecture)/i;
  if (reasoningSignals.test(s)) return 'complex';
  return 'simple';
}

/**
 * Pick the right AXON local tag for a task given a complexity level.
 * Falls back to pickPreferredAxonModel's ornith-first behavior if the
 * preferred tier is not installed.
 * @param {string[]} models
 * @param {'simple'|'complex'} complexity
 * @param {string} [fallback]
 */
export function pickAxonModelForComplexity(models = [], complexity = 'complex', fallback = 'llama3.2') {
  const list = (models || []).map(String);
  const preferred = complexity === 'simple' ? AXON_SIMPLE_MODEL : AXON_COMPLEX_MODEL;
  const other = complexity === 'simple' ? AXON_COMPLEX_MODEL : AXON_SIMPLE_MODEL;

  const hitPreferred = findAxonTag(list, preferred);
  if (hitPreferred) return hitPreferred;

  const hitOther = findAxonTag(list, other);
  if (hitOther) return hitOther;

  return pickPreferredAxonModel(list, fallback);
}
