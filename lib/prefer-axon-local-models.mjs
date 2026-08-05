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
