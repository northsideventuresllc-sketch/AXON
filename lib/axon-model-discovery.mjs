/**
 * LIVE MODEL DISCOVERY for the locked LLM chain (JB live requirement, 2026-09-24,
 * AG-VERIFY-CHAIN-EXHAUSTION-0924): the chain must NEVER call a model id that does not exist,
 * and must pick up each provider's newest free model automatically, because providers rename
 * and retire models (gemini-2.0-flash was retired while still pinned in GEMINI_MODEL, and the
 * whole gemini tier 404'd on every call).
 *
 * Each provider's own public catalog is the source of truth:
 *   gemini     GET generativelanguage.googleapis.com/v1beta/models  (generateContent only;
 *              preview / experimental / deprecated / non-text variants dropped; newest stable
 *              flash / flash-lite first)
 *   openrouter GET openrouter.ai/api/v1/models  (pricing prompt=0 AND completion=0 only;
 *              non-reasoning first, then newest, then largest context)
 *   anthropic  GET api.anthropic.com/v1/models  (paid last resort; configured rows validated
 *              against the list, then newest haiku, then newest sonnet)
 *   ollama     GET localhost:11434/api/tags via the Mac-mini relay (installed models only)
 *
 * Configured ids (router_models rows, the optional GEMINI_MODEL pin) are PINS: used only when
 * the live catalog contains them. A pin missing from the live list is ignored and logged.
 * When a catalog cannot be fetched at all, configured rows are used as-is (unverified) — the
 * chain degrades to its old behaviour instead of stalling, and a 404 / "model not found" at
 * call time still invalidates the cache and moves to the next candidate.
 *
 * Cache: ~6h per provider, in-process always, plus NI-Brain table `axon_model_catalog` when it
 * exists (DDL proposed in db/proposed/, NOT applied — every read/write here fails soft if the
 * table is absent, so this module works today with the in-process cache alone).
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
export const MODEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Newest models are often briefly overloaded (live 2026-09-24: gemini 3.5-3.8 flash all
// returned 503 "high demand" while 2.5-flash-lite answered), so a tier gets a few candidates
// and a known-good configured id stays reachable instead of being pushed off the end.
const MAX_CANDIDATES = 8;
const NEWEST_FIRST_COUNT = 3;

const memCache = new Map(); // provider -> { ids: string[], meta: object[], at: number }

function log(event, fields = {}) {
  try {
    console.error(JSON.stringify({ at: 'axon-model-discovery', event, ...fields }));
  } catch {
    console.error(`[axon-model-discovery] ${event}`);
  }
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

// ---------------------------------------------------------------------------
// Ranking (pure — exported for tests)
// ---------------------------------------------------------------------------

const GEMINI_EXCLUDE_RE =
  /(preview|exp\b|experimental|tts|image|audio|live|thinking|native|customtools|embedding|embed|robotics|computer-use|aqa|learnlm|gemma|imagen|veo|lyria|nano-banana|deep-research|omni)/i;

/** Rank a raw Gemini ListModels `models[]` into usable, free-tier text ids (newest first). */
export function rankGeminiModels(models) {
  const out = [];
  for (const m of Array.isArray(models) ? models : []) {
    const id = String(m?.name || '').replace(/^models\//, '');
    if (!id.startsWith('gemini-')) continue;
    if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
    if (GEMINI_EXCLUDE_RE.test(id)) continue;
    if (/deprecat|discontinu|will be (shut|turned) (down|off)/i.test(String(m.description || ''))) continue;
    const ver = id.match(/^gemini-(\d+(?:\.\d+)?)-/);
    const tier = /flash-lite/.test(id) ? 'flash-lite' : /flash/.test(id) ? 'flash' : /pro/.test(id) ? 'pro' : 'other';
    if (tier === 'pro' || tier === 'other') continue; // free tier = flash family
    out.push({ id, version: ver ? Number(ver[1]) : null, tier, alias: /-latest$/.test(id) });
  }
  out.sort((a, b) => {
    // versioned stable ids before moving aliases; newest version first; flash before lite
    if (a.alias !== b.alias) return a.alias ? 1 : -1;
    if ((b.version ?? 0) !== (a.version ?? 0)) return (b.version ?? 0) - (a.version ?? 0);
    if (a.tier !== b.tier) return a.tier === 'flash' ? -1 : 1;
    return a.id.length - b.id.length; // "gemini-2.5-flash" before "gemini-2.5-flash-001"
  });
  return out.map((m) => m.id);
}

// Live 2026-09-24 the free list also held music models (google/lyria-*-preview, 502 on chat),
// an unannounced "stealth" alpha, and the openrouter/free meta-router — none are stable chat.
const OPENROUTER_EXCLUDE_RE = /(safety|guard|embed|moderation|rerank|whisper|tts|lyria|preview|alpha|stealth|^openrouter\/)/i;

/** Rank a raw OpenRouter /models `data[]` into genuinely free text chat ids. */
export function rankOpenRouterModels(data) {
  const out = [];
  for (const m of Array.isArray(data) ? data : []) {
    const id = String(m?.id || '');
    if (!id) continue;
    const p = m.pricing || {};
    if (!(Number(p.prompt) === 0 && Number(p.completion) === 0)) continue;
    if (p.request != null && Number(p.request) !== 0) continue;
    if (OPENROUTER_EXCLUDE_RE.test(id)) continue;
    const outMods = m.architecture?.output_modalities;
    if (Array.isArray(outMods) && (outMods.length !== 1 || outMods[0] !== 'text')) continue;
    const inMods = m.architecture?.input_modalities;
    if (Array.isArray(inMods) && !inMods.includes('text')) continue;
    const reasoning = (m.supported_parameters || []).includes('reasoning');
    out.push({ id, reasoning, created: Number(m.created) || 0, ctx: Number(m.context_length) || 0 });
  }
  out.sort((a, b) => {
    if (a.reasoning !== b.reasoning) return a.reasoning ? 1 : -1;
    if (b.created !== a.created) return b.created - a.created;
    return b.ctx - a.ctx;
  });
  return out.map((m) => m.id);
}

/** Rank Anthropic /v1/models `data[]`: newest haiku first (cheapest paid), then sonnet. */
export function rankAnthropicModels(data) {
  const rows = (Array.isArray(data) ? data : []).filter((m) => m?.id);
  const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
  const fam = (re) => rows.filter((m) => re.test(m.id)).sort(byNewest).map((m) => m.id);
  const haiku = fam(/haiku/i);
  const sonnet = fam(/sonnet/i);
  const rest = rows.sort(byNewest).map((m) => m.id).filter((id) => !haiku.includes(id) && !sonnet.includes(id));
  return [...haiku, ...sonnet, ...rest];
}

/** Parse Ollama /api/tags JSON into installed chat-capable model names. */
export function parseOllamaTags(json) {
  const models = Array.isArray(json?.models) ? json.models : null;
  if (!models) return null;
  return models
    .map((m) => String(m?.name || m?.model || ''))
    .filter((n) => n && !/embed/i.test(n));
}

/**
 * Merge pins with the live catalog. Returns ordered candidate ids, never containing an id the
 * live list lacks (when a live list is known). `live === null` means "catalog unavailable".
 * @param {{live: string[]|null, pins?: string[], configured?: string[], pinsFirst?: boolean, provider?: string}} a
 */
export function buildCandidates({ live, pins = [], configured = [], pinsFirst = true, provider = '' }) {
  const clean = (arr) => arr.filter(Boolean).map(String);
  const p = clean(pins);
  const c = clean(configured);
  if (!live || !live.length) {
    // Catalog unavailable: configured rows unverified (old behaviour), explicit pins first.
    return dedupe([...p, ...c]).slice(0, MAX_CANDIDATES);
  }
  const liveSet = new Set(live);
  for (const id of [...p, ...c]) {
    if (!liveSet.has(id)) log('pinned_model_not_in_live_list_ignored', { provider, model: id });
  }
  const livePins = p.filter((id) => liveSet.has(id));
  const liveConfigured = c.filter((id) => liveSet.has(id));
  const ordered = pinsFirst
    ? [...livePins, ...liveConfigured, ...live]
    : [...livePins, ...live.slice(0, NEWEST_FIRST_COUNT), ...liveConfigured, ...live.slice(NEWEST_FIRST_COUNT)];
  return dedupe(ordered).slice(0, MAX_CANDIDATES);
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => !seen.has(x) && seen.add(x));
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchGeminiCatalog(apiKey) {
  if (!apiKey) return null;
  const all = [];
  let pageToken = '';
  for (let page = 0; page < 3; page += 1) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}&key=${apiKey}`,
      { method: 'GET', signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) throw new Error(`gemini ListModels HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j?.models)) throw new Error('gemini ListModels: unexpected shape');
    all.push(...j.models);
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return rankGeminiModels(all);
}

async function fetchOpenRouterCatalog() {
  const r = await fetch('https://openrouter.ai/api/v1/models', { method: 'GET', signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`openrouter /models HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j?.data)) throw new Error('openrouter /models: unexpected shape');
  return rankOpenRouterModels(j.data);
}

async function fetchAnthropicCatalog(apiKey) {
  if (!apiKey) return null;
  const r = await fetch('https://api.anthropic.com/v1/models?limit=1000', {
    method: 'GET',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) throw new Error(`anthropic /v1/models HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j?.data)) throw new Error('anthropic /v1/models: unexpected shape');
  return rankAnthropicModels(j.data);
}

async function fetchOllamaCatalog(supabaseKey, base) {
  const { queueMiniShellJobDetailed } = await import('./nvg-mini-queue.mjs');
  const host = /^https?:\/\/(localhost|127\.0\.0\.1):11434\/?$/.test(base || '') ? base.replace(/\/$/, '') : 'http://localhost:11434';
  const out = await queueMiniShellJobDetailed(supabaseKey, `curl -s -m 10 ${host}/api/tags`, {
    title: 'axon-ollama-tags',
    timeoutS: 10,
    maxWaitMs: 30_000,
  });
  if (!out.stdout) throw new Error(`ollama tags: ${out.reason || 'no stdout'}`);
  const names = parseOllamaTags(JSON.parse(out.stdout));
  if (!names) throw new Error('ollama tags: unexpected shape');
  return names;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

async function readDbCache(supabaseKey, provider) {
  if (!supabaseKey) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/axon_model_catalog?provider=eq.${provider}&select=models,fetched_at&limit=1`,
      { headers: { ...sbHeaders(supabaseKey), Accept: 'application/json' }, signal: AbortSignal.timeout(4_000) },
    );
    if (!r.ok) return null; // table absent until the proposed DDL is applied
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Array.isArray(row.models) || !row.fetched_at) return null;
    const at = new Date(row.fetched_at).getTime();
    if (!Number.isFinite(at) || Date.now() - at > MODEL_CACHE_TTL_MS) return null;
    return { ids: row.models.map(String), at };
  } catch {
    return null;
  }
}

async function writeDbCache(supabaseKey, provider, ids) {
  if (!supabaseKey) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/axon_model_catalog?on_conflict=provider`, {
      method: 'POST',
      headers: { ...sbHeaders(supabaseKey), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ provider, models: ids, fetched_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // fail soft — in-process cache still holds it
  }
}

/** Drop a provider's cached catalog (memory + DB) — called on a 404 / "model not found". */
export async function invalidateModelCache(provider, supabaseKey = null) {
  memCache.delete(provider);
  if (!supabaseKey) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/axon_model_catalog?provider=eq.${provider}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(supabaseKey), Prefer: 'return=minimal' },
      body: JSON.stringify({ fetched_at: new Date(0).toISOString() }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // fail soft
  }
}

/** Test hook. */
export function __resetModelDiscoveryCache() {
  memCache.clear();
}

/**
 * Live catalog for a provider (ranked ids), or null when it cannot be fetched.
 * @param {'gemini'|'openrouter'|'anthropic'|'ollama'} provider
 * @param {{apiKey?: string, supabaseKey?: string, base?: string, cachedOnly?: boolean}} [opts]
 *   cachedOnly: return only an already-cached list, never fetch (used by the local tier so a
 *   normal call never pays for an extra mini round-trip).
 */
export async function getLiveModels(provider, { apiKey, supabaseKey, base, cachedOnly = false } = {}) {
  const mem = memCache.get(provider);
  if (mem && Date.now() - mem.at < MODEL_CACHE_TTL_MS) return mem.ids;
  const db = await readDbCache(supabaseKey, provider);
  if (db) {
    memCache.set(provider, db);
    return db.ids;
  }
  if (cachedOnly) return null;
  try {
    let ids = null;
    if (provider === 'gemini') ids = await fetchGeminiCatalog(apiKey);
    else if (provider === 'openrouter') ids = await fetchOpenRouterCatalog();
    else if (provider === 'anthropic') ids = await fetchAnthropicCatalog(apiKey);
    else if (provider === 'ollama') ids = await fetchOllamaCatalog(supabaseKey, base);
    if (!ids || !ids.length) {
      log('catalog_empty', { provider });
      return null;
    }
    memCache.set(provider, { ids, at: Date.now() });
    writeDbCache(supabaseKey, provider, ids); // not awaited
    return ids;
  } catch (err) {
    log('catalog_fetch_failed', { provider, reason: String(err?.message || err).slice(0, 200) });
    return null;
  }
}

/** True for a provider error that means "this model id does not exist". */
export function isModelNotFoundError(err) {
  const s = String(err?.message || err || '');
  return /HTTP 404|not[_ ]found|no endpoints found|is not a valid model|model .*does not exist|no longer available/i.test(s);
}
