/**
 * AI-search-optimization lane for AXON Content Research — Build Plan A ticket A2.
 *
 * Folds the AXON-SEO-Tracker Phase-4 successor angle (nv-vault PR #376, Decision
 * #1786 "scripts out, agents in"): what people actually ASK an AI assistant
 * (ChatGPT / Claude / Gemini / Perplexity) about a venture's niche — real
 * questions, not search keywords — so CONTENT's drafts can get surfaced when an
 * assistant answers one of those questions. One finding per venture per run.
 *
 * Search door: lib/web-search.mjs webSearchRows — SerpApi when it has quota,
 * DuckDuckGo's keyless endpoint otherwise (WEB-SEARCH-FALLBACK-0906). Never
 * calls SerpApi directly. Synthesis: the one locked router chain via
 * lib/axon-generate.mjs (local -> RunPod -> OpenRouter free -> Gemini ->
 * Anthropic last). A search or synthesis miss returns an honest status —
 * never a fabricated question, stat, or competitor.
 */
import { webSearchRows } from './web-search.mjs';
import { generateViaRouter } from './axon-generate.mjs';

export const AI_SEARCH_LANE = 'ai_search';

/** The search query this lane runs for one venture — real questions, not keywords. */
export function aiSearchQuery(brand) {
  const vp = brand?.skeleton?.value_props?.[0]?.text;
  const subject = vp ? `${brand.name} (${vp})` : brand.name;
  return `what people ask ChatGPT Claude Gemini AI assistants about ${subject} questions 2026`;
}

/** Build the system + user prompt for the AI-search synthesis call. Exported for tests. */
export function buildAiSearchPrompt(brand, results, productTruths = '') {
  const system = `You are AXON's AI-search-optimization analyst for Northside Ventures Group (NVG).
Turn raw search results into ONE clear finding: the actual QUESTIONS people ask AI assistants
(ChatGPT, Claude, Gemini, Perplexity) about this venture's niche — real questions someone would
type or speak to an assistant, not search keywords. Plain English, no jargon, under 130 words.
End with one concrete way this venture's public copy or FAQ content could get surfaced when an
assistant answers one of those questions.
Only use what is actually in the search results below — never invent a question, a stat, or a
competitor that isn't there.`;

  const prompt = `Venture: ${brand.name} (${brand.venture})
What this venture does: ${brand?.skeleton?.value_props?.[0]?.text || 'not specified'}
${productTruths ? `Product truths (any copy you suggest MUST respect these): ${productTruths}\n` : ''}
Raw search results for "${aiSearchQuery(brand)}":
${JSON.stringify(
  results.map((r) => ({ title: r.title, snippet: r.snippet, link: r.link, source: r.source })),
  null,
  2
)}`;

  return { system, prompt };
}

/** Real raw-results fallback when synthesis is unreachable — never a fabricated finding. */
function rawSearchFallback(results) {
  const lines = (results || [])
    .slice(0, 5)
    .map((r) => `- ${r.title}${r.source ? ` (${r.source})` : ''}${r.snippet ? `: ${r.snippet.slice(0, 140)}` : ''}`);
  return lines.length
    ? `Couldn't synthesize this one automatically — here's the raw search picture:\n${lines.join('\n')}`
    : `No search results came back for this venture — nothing real to report yet.`;
}

/**
 * One AI-search-optimization pass for one venture: webSearchRows -> router synthesis.
 * @param {{serpApiKey?: string|null, supabaseKey?: string}} cfg
 * @param {{name:string, venture:string, slug:string}} brand
 * @param {{productTruths?:string, search?:Function, generate?:Function}} [deps] injectable for tests
 */
export async function researchAiSearchAngle(cfg, brand, deps = {}) {
  const { productTruths = '', search = webSearchRows, generate = generateViaRouter } = deps;
  const base = { venture: brand.venture, brand: brand.name, slug: brand.slug, lane: AI_SEARCH_LANE };

  let results = [];
  let searchError = null;
  try {
    results = await search(cfg.serpApiKey, aiSearchQuery(brand), 6);
  } catch (err) {
    searchError = err.message;
  }

  if (!results.length) {
    return {
      ...base,
      status: searchError
        ? `SEARCH_FAILED: ${searchError}`
        : 'NO_RESULTS: no results for this venture\'s AI-search query',
      finding: null,
    };
  }

  const { system, prompt } = buildAiSearchPrompt(brand, results, productTruths);

  try {
    const out = await generate(cfg.supabaseKey, {
      system,
      user: prompt,
      kind: 'cheap_chat',
      agentName: 'axon-content-research-ai-search',
      maxTokens: 700,
    });
    if (out?.text) {
      return { ...base, status: 'OK', finding: out.text, findingSource: out.source, resultCount: results.length };
    }
    console.warn(`AI-search synthesis for ${brand.slug} returned no text — using raw search fallback`);
  } catch (err) {
    console.warn(`AI-search synthesis failed for ${brand.slug} (${err.message}) — using raw search fallback`);
  }

  return {
    ...base,
    status: 'OK',
    finding: rawSearchFallback(results),
    findingSource: 'raw_search_fallback',
    resultCount: results.length,
  };
}
