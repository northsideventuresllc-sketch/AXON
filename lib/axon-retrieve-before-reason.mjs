/**
 * AX-RETRIEVE-BEFORE-REASON-GATE-0904 — the fix for JB's "AXON is guessing" feeling:
 * before a lane reasons/decides (capability_class === 'reasoning_planning'), pull the
 * relevant prior Learnings/Decisions/Context rows and hand them to the model as grounding,
 * instead of letting it reason cold every time.
 *
 * Pilot wiring: called once, from routeChat() in axon-router-core.mjs, right after
 * classifyCapability() resolves to 'reasoning_planning' — covers agent-chat, guest-chat,
 * dispatch/chat and agent-to-agent hops for free, since routeChat is the one funnel all of
 * them go through.
 *
 * Deliberately does NOT add a DB column to log the hit rate (retrieved_before_reason /
 * retrieval_meta) — adding a column is a schema migration, a Hard Stop that needs JB
 * (nvg-operator-core Section 7). Callers instead fold a short marker into the existing
 * free-text axon_router_decisions.chosen_reason field, which is enough to measure "% of
 * reasoning_planning calls that retrieved before reasoning" via a text search until a real
 * column is approved.
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function sbGet(key, path) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...hdrs(key), Accept: 'application/json' },
    });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

/** Keep the topic to a short phrase — a whole message dumped into an ILIKE is slow and noisy. */
function shortenTopic(topic, maxWords = 12) {
  return String(topic || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, maxWords)
    .join(' ');
}

function escapeIlike(s) {
  // PostgREST ilike.* pattern — escape characters that are special inside the pattern itself.
  return s.replace(/[%_]/g, (c) => `\\${c}`);
}

/**
 * Pull the most relevant recent Learnings/Decisions/Context rows for a topic, before the
 * model reasons about it. Never throws — a retrieval failure degrades to "nothing found",
 * it never blocks the reasoning call itself.
 *
 * @param {string} supabaseKey
 * @param {string} topic - free text, typically the user's message or task description
 * @param {{tables?: string[], limit?: number}} [opts]
 * @returns {Promise<{summary: string, hitCount: number, tableHits: Record<string, number>}>}
 */
export async function retrieveContextBeforeReason(supabaseKey, topic, opts = {}) {
  const { tables = ['Learnings', 'Decisions', 'Context'], limit = 5 } = opts;
  const empty = { summary: '', hitCount: 0, tableHits: {} };
  if (!supabaseKey) return empty;

  const words = shortenTopic(topic).split(' ').filter((w) => w.length > 3);
  if (!words.length) return empty;
  // A short OR-of-terms ilike pattern beats a single long phrase match — the topic is
  // rarely worded identically to how a past row phrased the same thing.
  const pattern = escapeIlike(words.slice(0, 5).join('%'));

  const tableColumn = { Learnings: 'learning', Decisions: 'decision', Context: 'content' };
  const tableHits = {};
  const lines = [];

  await Promise.all(
    tables.map(async (table) => {
      const col = tableColumn[table];
      if (!col) return;
      const rows = await sbGet(
        supabaseKey,
        `${table}?select=id,${col},date&${col}=ilike.*${encodeURIComponent(pattern)}*&order=date.desc&limit=${limit}`,
      );
      tableHits[table] = rows.length;
      for (const row of rows) {
        const text = String(row[col] || '').slice(0, 220);
        if (text) lines.push(`[${table}#${row.id}] ${text}`);
      }
    }),
  );

  const hitCount = lines.length;
  if (!hitCount) return { summary: '', hitCount: 0, tableHits };

  const summary = `Relevant prior context (retrieved before reasoning, ${hitCount} row(s)):\n${lines
    .slice(0, limit * tables.length)
    .join('\n')}`;
  return { summary, hitCount, tableHits };
}
