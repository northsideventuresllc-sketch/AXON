// WEB-SEARCH-FALLBACK-0906: SerpApi out of quota -> DuckDuckGo answers; SerpApi
// healthy -> SerpApi answers; DDG HTML parses into title/link/snippet rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webSearch, parseDuckDuckGoHtml } from '../lib/web-search.mjs';

const DDG_HTML = `
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fcoach&amp;rut=abc">Best <b>online</b> fitness coach</a></h2>
    <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fcoach">Find a <b>coach</b> that fits &amp; trains you.</a>
  </div>
</div>
<div class="result results_links web-result">
  <h2 class="result__title"><a class="result__a" href="https://example.org/plan">Training plan</a></h2>
  <div class="result__snippet">Twelve week plan.</div>
</div>`;

test('DuckDuckGo HTML parses into rows and unwraps redirect links', () => {
  const rows = parseDuckDuckGoHtml(DDG_HTML, 5);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Best online fitness coach');
  assert.equal(rows[0].link, 'https://example.com/coach');
  assert.equal(rows[0].snippet, 'Find a coach that fits & trains you.');
  assert.equal(rows[1].link, 'https://example.org/plan');
});

test('SerpApi out of quota -> DuckDuckGo answers, note says why', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('serpapi.com')) return { ok: false, status: 429, text: async () => 'You are out of searches' };
    return { ok: true, status: 200, text: async () => DDG_HTML };
  };
  const out = await webSearch({ serpApiKey: 'k', query: 'online fitness coach', num: 5, fetchImpl });
  assert.equal(out.provider, 'duckduckgo');
  assert.equal(out.results.length, 2);
  assert.match(out.note, /serpapi unavailable/);
});

test('SerpApi healthy -> SerpApi answers, no fallback call', async () => {
  let ddgCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('serpapi.com')) return { ok: true, status: 200, text: async () => JSON.stringify({ organic_results: [{ title: 'A', link: 'https://a.com', snippet: 's' }] }) };
    ddgCalls++;
    return { ok: true, status: 200, text: async () => DDG_HTML };
  };
  const out = await webSearch({ serpApiKey: 'k', query: 'q', num: 3, fetchImpl });
  assert.equal(out.provider, 'serpapi');
  assert.equal(out.results[0].link, 'https://a.com');
  assert.equal(ddgCalls, 0);
});

test('no key at all -> DuckDuckGo answers', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => DDG_HTML });
  const out = await webSearch({ serpApiKey: null, query: 'q', fetchImpl });
  assert.equal(out.provider, 'duckduckgo');
});
