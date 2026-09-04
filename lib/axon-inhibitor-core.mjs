/**
 * AXON Inhibitor — retrieval-gain control for AXON memory.
 *
 * HARD CONSTRAINT (JB LOCKED, Decision #569, 2026-08-04): AXON NEVER FORGETS.
 * Every memory is stored permanently at full fidelity forever. This module
 * contains NO eviction, NO TTL, NO pruning, NO decay, NO expiry, NO archiving
 * of stored memory. The dial is on RETRIEVAL, never on retention.
 *
 * What this module does instead: computes, LIVE at query time, a retrieval
 * gain per memory from context signals, and enforces a broadcast budget —
 * a hard cap on how many memories surface into working context at once.
 * Nothing computed here is ever persisted as a keep/drop verdict. A memory
 * scored low for today's task returns at full strength tomorrow when the
 * context changes. Silence is not deletion.
 *
 * Source concept: the Inhibitor chip — suppresses EXPRESSION without editing
 * the DNA, tuned to a baseline, fully reversible. Biology: adaptive gain
 * control (locus coeruleus / norepinephrine, Aston-Jones & Cohen 2005).
 * Spec: axon_research_findings a5ede57f-dfc5-410b-9987-352c10bd0e4e.
 *
 * @see docs/axon-inhibitor.md
 */

/**
 * Broadcast budget: hard cap on memories reaching working context per query.
 * Limited capacity IS the Global Workspace mechanism, not a bug to fix.
 * Sibling of JSPACE_MAX_CONCEPTS (concept slots) in axon-j-space-core.mjs.
 */
export const MEMORY_BROADCAST_BUDGET = 12;

/**
 * Foreign slots: portion of the budget reserved for memories deliberately
 * DISSIMILAR to what relevance alone would pick (maximal-marginal-relevance
 * diversity). This is the in-query excitatory counterweight — retrieval-gain
 * that only ever amplifies the current context converges on itself and gets
 * stuck thinking the same way. The scheduled foreign-input feed
 * (scripts/axon-foreign-input.mjs) is the cross-session counterweight.
 */
export const FOREIGN_SLOTS = 3;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'as', 'at',
  'by', 'from', 'not', 'no', 'do', 'does', 'did', 'have', 'has', 'had', 'i',
  'you', 'he', 'she', 'we', 'they', 'my', 'your', 'their', 'our', 'me', 'him',
  'her', 'them', 'so', 'if', 'then', 'than', 'too', 'very', 'can', 'will',
  'just', 'about', 'into', 'over', 'after', 'before', 'what', 'when', 'how',
]);

/** Tokenize free text into a set of significant lowercase terms. */
export function significantTerms(text) {
  if (!text) return new Set();
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

/** Jaccard-ish overlap of two term sets, normalized by the smaller set. */
export function termOverlap(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let hits = 0;
  const [small, large] = aSet.size <= bSet.size ? [aSet, bSet] : [bSet, aSet];
  for (const t of small) if (large.has(t)) hits += 1;
  return hits / small.size;
}

/**
 * Affinity of a memory_type to the current channel/task intent.
 * Preferences and relationships matter everywhere; facts spike for
 * research/execution; context spikes for chat continuity.
 */
const TYPE_AFFINITY = {
  chat: { preference: 1.0, relationship: 0.9, context: 0.9, fact: 0.7 },
  voice: { preference: 1.0, relationship: 0.9, context: 0.9, fact: 0.7 },
  briefing: { fact: 1.0, context: 0.9, preference: 0.7, relationship: 0.6 },
  outreach: { relationship: 1.0, preference: 0.9, fact: 0.8, context: 0.6 },
  research: { fact: 1.0, context: 0.8, preference: 0.5, relationship: 0.5 },
  execution: { fact: 1.0, context: 0.9, preference: 0.8, relationship: 0.6 },
};

/**
 * Compute retrieval gain for ONE memory against the CURRENT context.
 * Pure, deterministic, computed live per query. Never persisted.
 *
 * Signals (all live, none stored):
 *  - relevance: term overlap between memory content and the task text
 *  - typeAffinity: memory_type fit for the current channel
 *  - confidence: the memory's own stored confidence (a property of the
 *    memory's provenance, not a decay value — it does not change here)
 *  - continuity: overlap with the immediately preceding conversation turns
 *
 * NOT a signal: age. There is no time-based term anywhere in this function.
 * A memory silent for a year scores identically to one written today given
 * the same context match. That is the AXON NEVER FORGETS constraint made
 * arithmetic.
 *
 * @param {{content: string, memory_type?: string, confidence?: number}} memory
 * @param {{taskText?: string, channel?: string, recentTurnsText?: string,
 *          taskTerms?: Set<string>, recentTerms?: Set<string>}} context
 * @returns {number} gain in [0, ~3]
 */
export function computeRetrievalGain(memory, context = {}) {
  const taskTerms = context.taskTerms || significantTerms(context.taskText);
  const recentTerms = context.recentTerms || significantTerms(context.recentTurnsText);
  const memTerms = significantTerms(memory.content);

  const relevance = termOverlap(memTerms, taskTerms); // 0..1
  const continuity = termOverlap(memTerms, recentTerms); // 0..1
  const affinityRow = TYPE_AFFINITY[context.channel || 'chat'] || TYPE_AFFINITY.chat;
  const typeAffinity = affinityRow[memory.memory_type] ?? 0.7; // 0..1
  const confidence = Math.max(0, Math.min(1, Number(memory.confidence ?? 0.6)));

  return relevance * 1.5 + continuity * 0.6 + typeAffinity * 0.5 + confidence * 0.4;
}

/**
 * Select which memories surface into working context for the CURRENT task.
 *
 * Two-phase, budgeted:
 *  1. Gain phase — score every candidate live, take the top
 *     (budget - foreignSlots) by gain.
 *  2. Foreign phase — fill the remaining slots with the highest-gain
 *     memories LEAST similar to what phase 1 already picked
 *     (maximal marginal relevance), so the surfaced set cannot collapse
 *     into one theme.
 *
 * Returns the selected memories plus a trace (per-memory gain, phase) for
 * observability. The trace is diagnostic output for THIS query only —
 * persisting it as a keep/drop verdict is forbidden by design.
 *
 * @param {Array} memories candidate pool (ALL memories are candidates —
 *   there is no pre-filter that hides any memory from competition)
 * @param {object} context see computeRetrievalGain
 * @param {{budget?: number, foreignSlots?: number}} opts
 */
export function selectMemoriesForContext(memories, context = {}, opts = {}) {
  const budget = Math.max(1, opts.budget ?? MEMORY_BROADCAST_BUDGET);
  const foreignSlots = Math.max(0, Math.min(opts.foreignSlots ?? FOREIGN_SLOTS, budget - 1));

  const taskTerms = significantTerms(context.taskText);
  const recentTerms = significantTerms(context.recentTurnsText);
  const ctx = { ...context, taskTerms, recentTerms };

  const scored = (memories || []).map((m) => ({
    memory: m,
    gain: computeRetrievalGain(m, ctx),
    terms: significantTerms(m.content),
  }));
  scored.sort((a, b) => b.gain - a.gain);

  const primaryCount = Math.min(budget - foreignSlots, scored.length);
  const primary = scored.slice(0, primaryCount).map((s) => ({ ...s, phase: 'gain' }));
  const rest = scored.slice(primaryCount);

  // Foreign phase: MMR — highest gain among the most-dissimilar to selected.
  const selectedTerms = primary.map((s) => s.terms);
  const foreign = [];
  const pool = [...rest];
  while (foreign.length < foreignSlots && pool.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const maxSim = selectedTerms.length
        ? Math.max(...selectedTerms.map((t) => termOverlap(pool[i].terms, t)))
        : 0;
      const mmr = 0.4 * pool[i].gain - 1.0 * maxSim; // dissimilarity dominates
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }
    const picked = pool.splice(bestIdx, 1)[0];
    selectedTerms.push(picked.terms);
    foreign.push({ ...picked, phase: 'foreign' });
  }

  const selected = [...primary, ...foreign];
  return {
    memories: selected.map((s) => s.memory),
    trace: selected.map((s) => ({
      id: s.memory.id,
      gain: Number(s.gain.toFixed(3)),
      phase: s.phase,
    })),
    candidates: scored.length,
    budget,
  };
}

/**
 * INHIBITORY NODE — the verifier must always be a DIFFERENT agent than the
 * producer. In cortex, computation requires opposition; an agent graph where
 * the producer grades its own output has unopposed excitation.
 *
 * Throws if producer and verifier are the same identity (case-insensitive).
 */
export function requireDistinctVerifier(producerId, verifierId) {
  const p = String(producerId || '').trim().toLowerCase();
  const v = String(verifierId || '').trim().toLowerCase();
  if (!p || !v) {
    throw new Error('Inhibitory node: both producer and verifier identities are required.');
  }
  if (p === v) {
    throw new Error(
      `Inhibitory node violation: verifier "${verifierId}" is the producer. ` +
        'The verifier must always be a different agent than the producer.'
    );
  }
  return true;
}

/**
 * Pick a verifier for a producer from a roster, guaranteed distinct.
 * Deterministic: first roster agent that is not the producer.
 */
export function pickVerifier(producerId, roster = []) {
  const p = String(producerId || '').trim().toLowerCase();
  const verifier = roster.find((r) => String(r).trim().toLowerCase() !== p);
  if (!verifier) {
    throw new Error(
      `Inhibitory node: no distinct verifier available in roster for producer "${producerId}".`
    );
  }
  requireDistinctVerifier(producerId, verifier);
  return verifier;
}
