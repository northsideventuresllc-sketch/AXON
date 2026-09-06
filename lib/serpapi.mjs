import { webSearch } from './web-search.mjs';

/**
 * Prospect / research discovery. WEB-SEARCH-FALLBACK-0906: SerpApi while it
 * has quota, DuckDuckGo (keyless) when it does not — never an empty list just
 * because the paid plan ran out. Callers without a key still get results.
 */
export async function searchProspects(apiKey, query, num = 8) {
  if (!apiKey) console.warn('SERPAPI_API_KEY missing — using the free search fallback');
  const { results, provider, note } = await webSearch({ serpApiKey: apiKey, query, num });
  if (provider !== 'serpapi' && note) console.log(`[web-search] ${provider} answered — ${note}`);
  return results;
}
