/**
 * One web-search door for every AXON research lane — WEB-SEARCH-FALLBACK-0906.
 *
 * JB live, 2026-09-06: three research agents reported "0 findings, 9 blocked"
 * two days running. Root cause: the SerpApi free plan (250 searches/month)
 * was exhausted, and every caller treated a failed SerpApi call as "no
 * results". Free tiers first (standing rule 1): SerpApi when it has quota,
 * otherwise DuckDuckGo's keyless HTML endpoint. Never silently empty — the
 * returned object says which provider answered and why the first one didn't.
 */

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function decodeEntities(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function unwrapDdgLink(href) {
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const target = u.searchParams.get('uddg');
    return target ? decodeURIComponent(target) : u.toString();
  } catch {
    return href;
  }
}

/** Parse DuckDuckGo's HTML results page into {title, link, snippet} rows. Exported for tests. */
export function parseDuckDuckGoHtml(html, num = 8) {
  const out = [];
  const blocks = String(html || '').split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const block of blocks) {
    const a = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const link = unwrapDdgLink(decodeEntities(a[1]));
    const title = decodeEntities(a[2]);
    const sn = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = sn ? decodeEntities(sn[1]) : '';
    if (!title || !/^https?:\/\//i.test(link)) continue;
    if (/duckduckgo\.com\/y\.js/i.test(link)) continue; // ads
    out.push({ title, link, snippet, source: 'duckduckgo' });
    if (out.length >= num) break;
  }
  return out;
}

async function serpApiSearch(apiKey, query, num, fetchImpl) {
  const params = new URLSearchParams({ engine: 'google', q: query, num: String(num), api_key: apiKey, gl: 'us', hl: 'en' });
  const r = await fetchImpl(`https://serpapi.com/search.json?${params}`);
  const text = await r.text();
  if (!r.ok) throw new Error(`SERPAPI HTTP ${r.status}: ${text.slice(0, 160)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('SERPAPI non-JSON response'); }
  if (data.error) throw new Error(`SERPAPI: ${String(data.error).slice(0, 160)}`);
  return (data.organic_results || [])
    .filter((row) => row.title && row.link)
    .slice(0, num)
    .map((row) => ({ title: row.title, snippet: row.snippet || '', link: row.link, source: row.source || 'serpapi' }));
}

async function duckDuckGoSearch(query, num, fetchImpl) {
  const r = await fetchImpl(`${DDG_ENDPOINT}?q=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': UA, accept: 'text/html' },
  });
  const html = await r.text();
  if (!r.ok) throw new Error(`DuckDuckGo HTTP ${r.status}`);
  return parseDuckDuckGoHtml(html, num);
}

/**
 * @param {{ serpApiKey?: string|null, query: string, num?: number, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<{ results: {title:string, link:string, snippet:string, source:string}[], provider: 'serpapi'|'duckduckgo'|'none', note: string|null }>}
 */
export async function webSearch(opts) {
  const { serpApiKey = null, query, num = 8, fetchImpl = fetch } = opts || {};
  if (!query) return { results: [], provider: 'none', note: 'empty query' };
  let note = null;

  if (serpApiKey) {
    try {
      const results = await serpApiSearch(serpApiKey, query, num, fetchImpl);
      if (results.length) return { results, provider: 'serpapi', note: null };
      note = 'serpapi returned no organic results';
    } catch (err) {
      note = `serpapi unavailable: ${err.message}`;
    }
  } else {
    note = 'no serpapi key';
  }

  try {
    const results = await duckDuckGoSearch(query, num, fetchImpl);
    return { results, provider: results.length ? 'duckduckgo' : 'none', note };
  } catch (err) {
    return { results: [], provider: 'none', note: `${note}; duckduckgo unavailable: ${err.message}` };
  }
}

/** Legacy shape: just the rows. Used by the older research lanes. */
export async function webSearchRows(serpApiKey, query, num = 5) {
  const { results, provider, note } = await webSearch({ serpApiKey, query, num });
  if (provider !== 'serpapi' && note) console.log(`[web-search] ${provider} answered "${query.slice(0, 60)}" — ${note}`);
  return results;
}
