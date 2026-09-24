/**
 * AXON-NIGHTLY-DIGEST-BUILD-0923 — pure novelty-scoring + I/O for the nightly
 * memory digest. Reads the day's Decisions/Learnings rows (NI-Brain's running
 * session-log of what agents did/found), scores each against a rolling prior-N-day
 * word-frequency corpus (an average-IDF "surprise" score: unique/rare wording
 * scores higher, boilerplate repeated night after night scores near zero), and
 * ranks the top-N most novel entries.
 *
 * Read-only against the model itself — no weight updates, no fine-tune step.
 * This is the safe half of Decision AXON-NIGHTLY-MEMORY-REVIEW-REAL-STATUS-0923;
 * the unsupervised-fine-tune half is explicitly out of scope here.
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const DIGEST_TABLE = 'axon_nightly_digest';
const DEFAULT_PRIOR_DAYS = 7;
const DEFAULT_TOP_N = 15;

const STOPWORDS = new Set(
  'the a an and or but if then else for to of in on at by with from as is are was were be been being this that these those it its it\'s not no do did does done has have had will would could should can may might than then so per via into out up down over under again further once more most other some such only own same too very just also not'
    .split(/\s+/),
);

/** Tokenize into lowercase, deduped, stopword-filtered words (>=3 chars). */
export function tokenize(text) {
  const words = String(text || '')
    .toLowerCase()
    .match(/[a-z][a-z0-9_-]{2,}/g) || [];
  return [...new Set(words.filter((w) => !STOPWORDS.has(w)))];
}

/** Build a doc-frequency table (word -> number of prior entries containing it) plus doc count. */
export function buildCorpusFreq(priorEntries) {
  const docFreq = new Map();
  for (const entry of priorEntries) {
    for (const word of tokenize(entry.text)) {
      docFreq.set(word, (docFreq.get(word) || 0) + 1);
    }
  }
  return { docFreq, docCount: priorEntries.length };
}

/**
 * Average-IDF novelty score for one entry against the prior corpus.
 * Words never seen in the prior window get max IDF; words seen in every prior
 * entry get IDF near 0. Score is the mean over the entry's unique words, so
 * length alone doesn't inflate it — density of unusual wording does.
 */
export function scoreEntry(text, corpus) {
  const words = tokenize(text);
  if (words.length === 0) return 0;
  const { docFreq, docCount } = corpus;
  const total = words.reduce((sum, w) => {
    const df = docFreq.get(w) || 0;
    return sum + (Math.log((docCount + 1) / (df + 1)) + 1);
  }, 0);
  return total / words.length;
}

/**
 * Score and rank the day's entries against the prior-N-day corpus.
 * `dayEntries` / `priorEntries`: [{ ref, text }]. Returns rows shaped for
 * axon_nightly_digest: { day_key, entry_ref, score, summary }, highest score first.
 */
export function rankTopN(dayEntries, priorEntries, dayKey, topN = DEFAULT_TOP_N) {
  const corpus = buildCorpusFreq(priorEntries);
  const scored = dayEntries.map((e) => ({
    day_key: dayKey,
    entry_ref: e.ref,
    score: Math.round(scoreEntry(e.text, corpus) * 10000) / 10000,
    summary: String(e.text || '').slice(0, 300),
  }));
  scored.sort((a, b) => b.score - a.score || a.entry_ref.localeCompare(b.entry_ref));
  return scored.slice(0, topN);
}

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** ISO 'YYYY-MM-DD' boundaries (UTC) for a given day key. */
function dayBoundsUtc(dayKey) {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchTableEntries({ table, textCol, fromIso, toIso, key, fetchImpl }) {
  const filter = `created_at=gte.${fromIso}&created_at=lt.${toIso}&select=id,${textCol},created_at&order=created_at.asc`;
  const r = await fetchImpl(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    headers: { ...hdrs(key), Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`fetch ${table}: HTTP ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows.map((row) => ({ ref: `${table}:${row.id}`, text: row[textCol] }));
}

/** Pull both Decisions and Learnings rows created within [fromIso, toIso). */
export async function fetchEntriesInRange({ fromIso, toIso, key, fetchImpl }) {
  const [decisions, learnings] = await Promise.all([
    fetchTableEntries({ table: 'Decisions', textCol: 'decision', fromIso, toIso, key, fetchImpl }),
    fetchTableEntries({ table: 'Learnings', textCol: 'learning', fromIso, toIso, key, fetchImpl }),
  ]);
  return [...decisions, ...learnings];
}

async function upsertDigestRows(rows, key, fetchImpl) {
  if (rows.length === 0) return 0;
  const r = await fetchImpl(`${SUPABASE_URL}/rest/v1/${DIGEST_TABLE}?on_conflict=day_key,entry_ref`, {
    method: 'POST',
    headers: { ...hdrs(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`upsert ${DIGEST_TABLE}: HTTP ${r.status} ${await r.text()}`);
  return rows.length;
}

/**
 * Full nightly run: score `dayKey`'s Decisions/Learnings against the prior
 * `priorDays` window and write the top `topN` to axon_nightly_digest.
 * Injectable `fetchImpl` for tests; `dryRun` skips the write.
 */
export async function runNightlyDigest({
  dayKey,
  priorDays = DEFAULT_PRIOR_DAYS,
  topN = DEFAULT_TOP_N,
  key,
  fetchImpl = fetch,
  dryRun = false,
}) {
  const { start: dayStart, end: dayEnd } = dayBoundsUtc(dayKey);
  const priorStart = new Date(new Date(dayStart).getTime() - priorDays * 24 * 60 * 60 * 1000).toISOString();

  const [dayEntries, priorEntries] = await Promise.all([
    fetchEntriesInRange({ fromIso: dayStart, toIso: dayEnd, key, fetchImpl }),
    fetchEntriesInRange({ fromIso: priorStart, toIso: dayStart, key, fetchImpl }),
  ]);

  const rows = rankTopN(dayEntries, priorEntries, dayKey, topN);

  let written = 0;
  if (!dryRun) {
    written = await upsertDigestRows(rows, key, fetchImpl);
  }

  return {
    ok: true,
    dayKey,
    dayEntryCount: dayEntries.length,
    priorEntryCount: priorEntries.length,
    rows,
    written,
    dryRun,
  };
}
