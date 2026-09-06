/**
 * Real external/public research helpers for AXON Social Media Research and
 * AXON SEO Tracker (rebuilt 2026-08-26, JB direct correction — these do NOT
 * wait on JB's own first-party social credentials).
 *
 * Two-step pipeline, both steps real:
 *   1. externalSearch() — SerpApi Google search (lib/serpapi.mjs), same tool
 *      already used and confirmed working in the retired outreach entrypoint /
 *      scripts/axon-self-research.mjs. Real organic results, never faked.
 *   2. synthesizeFinding() — turns those raw results into ONE usable,
 *      plain-English finding, generated through the one locked router chain
 *      (lib/axon-router-core.mjs: local -> RunPod -> OpenRouter free -> Gemini
 *      -> Anthropic last). If SerpApi returns nothing, or the whole chain is
 *      unreachable, this never invents a finding — it falls back to the real
 *      raw titles/snippets instead of a synthesis.
 */
import { searchProspects } from './serpapi.mjs';
import { generateViaRouter } from './axon-generate.mjs';

/** Real Google search via SerpApi. Same generic wrapper the outreach lane already uses. */
export async function externalSearch(apiKey, query, num = 6) {
  return searchProspects(apiKey, query, num);
}

function rawFallback(rawResults) {
  const lines = (rawResults || [])
    .slice(0, 5)
    .map((r) => `- ${r.title}${r.source ? ` (${r.source})` : ''}${r.snippet ? `: ${r.snippet.slice(0, 140)}` : ''}`);
  return lines.length
    ? `Couldn't synthesize this one automatically — here's the raw search picture:\n${lines.join('\n')}`
    : `No search results came back for this venture — nothing real to report yet.`;
}

/**
 * Turn raw SerpApi results into ONE clear, plain-English finding.
 * One router chain -> raw-titles fallback. Never fabricated text — the fallback
 * is real search data, just unsynthesized. `source` names whichever lane
 * answered, so rows written from this keep their existing shape.
 * @returns {Promise<{text: string, source: string}>}
 */
export async function synthesizeFinding(cfg, { system, prompt, rawResults }, generate = generateViaRouter) {
  try {
    const out = await generate(cfg.supabaseKey, {
      system,
      user: prompt,
      kind: 'cheap_chat',
      agentName: 'axon-content-research',
      maxTokens: 700,
    });
    if (out.text) return { text: out.text, source: out.source };
  } catch (err) {
    console.warn(`Synthesis chain failed (${err.message}) — falling back to raw search titles`);
  }
  return { text: rawFallback(rawResults), source: 'raw_serp_fallback' };
}
