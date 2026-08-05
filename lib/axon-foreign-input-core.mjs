/**
 * AXON Foreign-Input Feed — the excitatory counterweight to the Inhibitor.
 *
 * Retrieval gain that only ever amplifies the current context is a positive
 * feedback loop: the agent converges and gets stuck thinking the same way
 * (Cody Schneider's "entropy"). Inhibition alone gives rigidity; the
 * counterweight is deliberate injection of input from OUTSIDE the system.
 *
 * This runs on a schedule and posts a foreign concept into J-space each cycle,
 * drawn from a domain deliberately distant from AXON's own operational lanes.
 * It is additive only — it posts a concept, it NEVER deletes, expires or
 * downgrades any memory (AXON NEVER FORGETS).
 *
 * Distinct from axon-self-research: self-research studies AXON's own gap
 * backlog (AI models, OSS, neuroscience — inward). Foreign-input reaches for
 * an unrelated domain (outward) precisely so retrieval cannot self-confirm.
 */

/**
 * Domains chosen to be OFF AXON's operational map. Rotation is deterministic
 * by day so a scheduled run needs no RNG. The point is distance, not novelty
 * for its own sake — each is a different structural world to borrow from.
 */
export const FOREIGN_DOMAINS = [
  { id: 'ecology', label: 'Ecology & food webs', query: 'keystone species trophic cascade resilience' },
  { id: 'materials', label: 'Materials science', query: 'phase transition annealing defect propagation' },
  { id: 'music_theory', label: 'Music theory', query: 'counterpoint tension resolution voice leading' },
  { id: 'immunology', label: 'Immunology', query: 'immune tolerance self non-self discrimination' },
  { id: 'urban_planning', label: 'Urban planning', query: 'traffic flow congestion emergent bottleneck' },
  { id: 'geology', label: 'Geology', query: 'sediment stratification pressure release fault' },
  { id: 'linguistics', label: 'Historical linguistics', query: 'sound change drift borrowing language contact' },
];

/** Deterministic domain pick by UTC day — no RNG (scheduled-run safe). */
export function pickForeignDomain(date = new Date()) {
  return FOREIGN_DOMAINS[date.getUTCDay() % FOREIGN_DOMAINS.length];
}

/**
 * Build the foreign concept to post into J-space from gathered sources.
 * Heuristic-safe: works with zero sources so a scheduled run never fails
 * on an empty search.
 */
export function buildForeignConcept(domain, sources = []) {
  const top = (sources || []).find((s) => s?.title || s?.snippet);
  const detail = top
    ? `${String(top.title || '').slice(0, 90)} — ${String(top.snippet || '').slice(0, 160)}`
    : `Foreign lens from ${domain.label}. No live source this cycle; the prompt to carry forward is: what does ${domain.label} do that AXON's current thinking does not?`;

  return {
    id: `foreign-${domain.id}-${date_seed(sources)}`,
    label: `Foreign input: ${domain.label}`,
    detail,
    module: 'research',
    priority: 'low',
    source: 'foreign-input-feed',
    evidence_count: 1,
  };
}

// Stable-ish id fragment without Date.now()/random (scheduled-run safe):
// derive from the source list length + first url hash.
function date_seed(sources) {
  const s = (sources && sources[0] && (sources[0].link || sources[0].title)) || 'seed';
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `${(sources || []).length}-${h.toString(36)}`;
}
