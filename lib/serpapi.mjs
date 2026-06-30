export async function searchProspects(apiKey, query, num = 8) {
  if (!apiKey) {
    console.warn('SERPAPI_API_KEY missing — skipping discovery');
    return [];
  }
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    num: String(num),
    api_key: apiKey,
    gl: 'us',
    hl: 'en',
  });
  const r = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!r.ok) throw new Error(`SERPAPI HTTP ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const results = data.organic_results || [];
  return results
    .filter((row) => row.title && row.link)
    .map((row) => ({
      title: row.title,
      snippet: row.snippet || '',
      link: row.link,
      source: row.source || '',
    }));
}
