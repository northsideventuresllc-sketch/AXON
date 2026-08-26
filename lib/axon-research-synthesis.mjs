/**
 * Real external/public research helpers for AXON Social Media Research and
 * AXON SEO Tracker (rebuilt 2026-08-26, JB direct correction — these do NOT
 * wait on JB's own first-party social credentials).
 *
 * Two-step pipeline, both steps real:
 *   1. externalSearch() — SerpApi Google search (lib/serpapi.mjs), same tool
 *      already used and confirmed working in scripts/axon-ni-outreach.mjs /
 *      scripts/axon-self-research.mjs. Real organic results, never faked.
 *   2. synthesizeFinding() — turns those raw results into ONE usable,
 *      plain-English finding (Gemini primary, Anthropic Haiku fallback).
 *      If SerpApi returns nothing, or both LLMs fail, this never invents a
 *      finding — it says so, or falls back to the real raw titles/snippets
 *      instead of a synthesis.
 */
import { GEMINI_MODEL, HAIKU_MODEL } from './constants.mjs';
import { searchProspects } from './serpapi.mjs';

/** Real Google search via SerpApi. Same generic wrapper axon-ni-outreach.mjs already uses. */
export async function externalSearch(apiKey, query, num = 6) {
  return searchProspects(apiKey, query, num);
}

async function callGeminiText(apiKey, prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 700,
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim();
  if (!text) throw new Error('Gemini empty response');
  return text;
}

async function callHaikuText(apiKey, system, user, maxTokens = 700) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return data.content?.map((c) => c.text || '').join('').trim();
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
 * Gemini -> Anthropic Haiku -> raw-titles fallback. Never fabricated text —
 * the fallback is real search data, just unsynthesized.
 * @returns {Promise<{text: string, source: 'gemini'|'anthropic-haiku'|'raw_serp_fallback'}>}
 */
export async function synthesizeFinding(cfg, { system, prompt, rawResults }) {
  if (cfg.geminiKey) {
    try {
      const text = await callGeminiText(
        cfg.geminiKey,
        `${system}\n\n${prompt}`,
        cfg.geminiModel || GEMINI_MODEL,
      );
      return { text, source: 'gemini' };
    } catch (err) {
      console.warn(`Gemini synthesis failed (${err.message}) — trying Anthropic`);
      if (cfg.geminiBackup) {
        try {
          const text = await callGeminiText(cfg.geminiBackup, `${system}\n\n${prompt}`, cfg.geminiModel || GEMINI_MODEL);
          return { text, source: 'gemini-backup-key' };
        } catch (err2) {
          console.warn(`Gemini backup key also failed (${err2.message})`);
        }
      }
    }
  }
  if (cfg.anthropicKey) {
    try {
      const text = await callHaikuText(cfg.anthropicKey, system, prompt);
      if (text) return { text, source: 'anthropic-haiku' };
    } catch (err) {
      console.warn(`Anthropic synthesis failed (${err.message}) — falling back to raw search titles`);
    }
  }
  return { text: rawFallback(rawResults), source: 'raw_serp_fallback' };
}
