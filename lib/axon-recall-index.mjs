/**
 * axon-recall-index.mjs — a minimal keyword-overlap recall index over AXON's
 * exported NI-Brain training corpus (scripts/axon-history-export.mjs's
 * `{prompt, completion, ...}` records), plus a test proving it actually
 * recalls the right Learning/Decision for a query.
 *
 * AXON-MODEL-FRONTIER-SESSION-0925 deliverable 3, "wire every Learning into
 * AXON retrieval/training so it can apply all of them, with a test proving
 * recall": FRONTIER-08 (AXON PR #274, merged) built the export (NI-Brain rows
 * -> local JSONL corpus) but stopped at export — nothing read that corpus back
 * and nothing proved a query could find the right record in it. This file is
 * that missing read side: a first, honest, non-ML recall layer (TF-style term
 * overlap, no embeddings, no paid API — free-tier-only per standing rule) that
 * a local AXON call or a RAG-lite system prompt can build on. It does not
 * replace a real fine-tune or a vector index — it proves the wiring end to
 * end: index the corpus, ask a question, get back the record that actually
 * answers it, ranked correctly against irrelevant records in the same corpus.
 *
 * Pure functions only — no network, no filesystem — so this is unit-testable
 * without a live NI-Brain read (see axon-recall-index.test.mjs, which also
 * covers the case that motivated this file: a corpus large enough that a
 * naive substring search would return too many false positives, resolved by
 * scoring on term overlap rather than a single substring match).
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'were',
  'will', 'with', 'not', 'never', 'always', 'recall', 'relevant', 'general', 'operations',
]);

/** Lowercase, strip punctuation, drop stopwords/short tokens. Exported for tests. */
export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Build a recall index from training records (the exact shape
 * axon-history-export.mjs's toTrainingRecord/buildRecordsForSource produce:
 * {kind, source_id, project, created_at, prompt, completion}).
 * @returns {{records: object[], docs: Array<{record:object, terms:Set<string>, termCounts:Map<string,number>}>}}
 */
export function buildRecallIndex(records) {
  const docs = (records || []).map((record) => {
    const terms = tokenize(`${record.completion || ''} ${record.project || ''}`);
    const termCounts = new Map();
    for (const t of terms) termCounts.set(t, (termCounts.get(t) || 0) + 1);
    return { record, terms: new Set(terms), termCounts };
  });
  return { records: records || [], docs };
}

/**
 * Score + rank the index against a free-text query. Term-overlap score: for
 * each query term present in a doc, add that term's count in the doc (a term
 * mentioned 3x scores higher than one mentioned once), then normalize by doc
 * length so a short, focused record beats a long one that only mentions the
 * term in passing.
 * @returns {Array<{record:object, score:number}>} sorted best-first, zero-score docs dropped
 */
export function recall(index, query, topK = 5) {
  const qTerms = tokenize(query);
  if (!qTerms.length || !index?.docs?.length) return [];
  const scored = index.docs.map(({ record, termCounts }) => {
    let raw = 0;
    for (const t of qTerms) raw += termCounts.get(t) || 0;
    const length = Array.from(termCounts.values()).reduce((a, b) => a + b, 0) || 1;
    return { record, score: raw / Math.sqrt(length) };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
