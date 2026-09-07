/**
 * AX-BOOT-WISDOM (BPA-C2-BRAIN-GAPS-0906, part b) — consolidated wisdom read at boot.
 *
 * lib/wisdom-absorb-loop.mjs's enhanceFromWisdom() already digests + ranks wisdom
 * units and can format a prompt block (formatWisdomForPrompt), but nothing reads
 * the *persisted* result (`axon_wisdom_items`, the output of a live absorb run)
 * back into an agent's boot context — every boot started cold on wisdom, even
 * when NI-Brain already held ranked, absorbed wisdom from a prior run.
 *
 * loadBootWisdom() closes that: read the highest-salience absorbed rows straight
 * from `axon_wisdom_items`, cap the block to a token-lean size, and hand back a
 * labelled block ready to prepend to a system prompt — same shape as
 * buildAgentBootContext()'s systemPrompt in lib/axon-agent-boot.mjs, which is
 * where this is wired in (see wireBootWisdomIntoContext below).
 *
 * On by default. Set AXON_BOOT_WISDOM=0 to disable (e.g. a context-budget test,
 * or isolating a regression) without touching call sites.
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
export const BOOT_WISDOM_TABLE = 'axon_wisdom_items';
export const DEFAULT_BOOT_WISDOM_LIMIT = 8;
export const MAX_BOOT_WISDOM_BLOCK_CHARS = 1500;

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/** Default client: real PostgREST read against axon_wisdom_items. Never throws. */
async function defaultFetchWisdomRows(supabaseKey, limit) {
  try {
    const filter =
      `status=eq.absorbed&order=salience.desc,absorbed_at.desc` +
      `&select=title,principle,application,domain,source_type,salience&limit=${limit}`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${BOOT_WISDOM_TABLE}?${filter}`, {
      headers: { ...hdrs(supabaseKey), Accept: 'application/json' },
    });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

function clip(text, n) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

/** True unless the operator has explicitly turned the boot-wisdom read off. */
export function bootWisdomEnabled(env = process.env) {
  return env.AXON_BOOT_WISDOM !== '0';
}

/**
 * Format already-ranked wisdom rows into a capped, labelled prompt block.
 * Rows are trusted to already be in salience order (highest first) — this
 * function does not re-sort, so a caller passing pre-ranked rows keeps that
 * order and a caller wanting a re-rank should sort before calling.
 * @param {Array<{title?:string, principle?:string, application?:string, domain?:string, source_type?:string, salience?:number}>} rows
 */
export function formatBootWisdomBlock(rows = []) {
  if (!rows.length) {
    return '';
  }
  const header = 'Consolidated wisdom (Northside · JB) — highest-salience absorbed principles at boot:';
  const lines = [header];
  for (const row of rows) {
    const title = clip(row.title || 'Wisdom', 100);
    const principle = clip(row.principle || '', 160);
    const line = `- [${row.domain || 'general'}/${row.source_type || 'unknown'}] ${title}${
      principle ? ` — ${principle}` : ''
    }`;
    const candidate = [...lines, line].join('\n');
    if (candidate.length > MAX_BOOT_WISDOM_BLOCK_CHARS) break;
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Read the consolidated (already-absorbed) wisdom rows and return a labelled,
 * capped context block ready to prepend to a system prompt. Disabled (empty
 * block) when AXON_BOOT_WISDOM=0 or there is no key/rows.
 *
 * @param {{
 *   limit?: number,
 *   supabaseKey?: string,
 *   env?: NodeJS.ProcessEnv,
 *   fetchRows?: (supabaseKey: string, limit: number) => Promise<Array<object>>,
 * }} [opts]
 * @returns {Promise<{ enabled: boolean, block: string, rows: Array<object>, count: number }>}
 */
export async function loadBootWisdom(opts = {}) {
  const {
    limit = DEFAULT_BOOT_WISDOM_LIMIT,
    supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    env = process.env,
    fetchRows = defaultFetchWisdomRows,
  } = opts;

  if (!bootWisdomEnabled(env)) {
    return { enabled: false, block: '', rows: [], count: 0 };
  }
  if (!supabaseKey) {
    return { enabled: true, block: '', rows: [], count: 0 };
  }

  let rows = [];
  try {
    rows = (await fetchRows(supabaseKey, limit)) || [];
  } catch {
    rows = [];
  }

  // Defensive re-sort: fetchRows is expected to already order by salience desc
  // (the default client's `order=` param does), but a caller-supplied
  // fetchRows (e.g. a test stub, or a future non-PostgREST source) isn't
  // guaranteed to, and this is the one place that promises "salience order".
  const ranked = [...rows].sort((a, b) => (Number(b.salience) || 0) - (Number(a.salience) || 0));

  const block = formatBootWisdomBlock(ranked);
  return { enabled: true, block, rows: ranked, count: ranked.length };
}
