#!/usr/bin/env node
/**
 * AXON-SCRAPEGRAPHAI-PILOT-0817: head-to-head timing/output comparison of
 * ScrapeGraphAI (SmartScraperGraph, backed by local Ollama axon-llama) against
 * plain fetch+extract on the same URL and prompt.
 *
 * Usage: node scripts/scrapegraphai-pilot-0905.mjs
 *
 * IMPORTANT — read before trusting this file's "scrapegraphai" numbers:
 * `scrapegraphai` is a Python-only package (SmartScraperGraph, built on
 * LangChain + Playwright) with no native JS/Node port. Ported here 2026-09-14
 * (Scripts OUT, Agents IN, Decision #1786) as a REIMPLEMENTATION of what
 * SmartScraperGraph actually does for this prompt shape — fetch the page,
 * reduce it to text, send text+prompt to the configured local LLM in one call,
 * return its answer — using plain fetch + a regex HTML-to-text reducer + a
 * direct Ollama call, since there is no equivalent library to call instead.
 * This is NOT the scrapegraphai library and its timing/output will not be
 * identical to a real SmartScraperGraph run (no Playwright render step, a much
 * simpler text-reduction pass, no automatic chunking for long pages). The
 * `engine` field below is renamed accordingly rather than claiming to be
 * "scrapegraphai" when it structurally isn't — if this pilot's whole point is
 * literally benchmarking the Python library, this file cannot substitute for
 * that and the comparison should keep running via the original Python
 * `.venv-pilot` environment (untouched by this port) rather than trust this
 * output as equivalent.
 */

const URL = 'https://en.wikipedia.org/wiki/Web_scraping';
const PROMPT = 'List the main sections of this page as a JSON array of section titles.';

const GRAPH_CONFIG = {
  llm: {
    model: 'ollama/axon-llama',
    base_url: 'http://localhost:11434',
    temperature: 0,
  },
  verbose: false,
  headless: true,
};

/** Reduce raw page HTML to visible text — a crude stand-in for what
 * SmartScraperGraph's own document loader + text splitter does. */
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best-effort JSON extraction from a model response — mirrors SmartScraperGraph's
 * own "parse the LLM's answer as structured output" step, minus its schema
 * validation machinery. */
function tryParseJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the first [...] or {...} block in the response.
    const match = trimmed.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return null;
  }
}

async function runScraper() {
  const started = Date.now();

  const pageResp = await fetch(URL, { signal: AbortSignal.timeout(30_000) });
  if (!pageResp.ok) throw new Error(`fetch ${URL} -> HTTP ${pageResp.status}`);
  const html = await pageResp.text();
  const text = htmlToText(html).slice(0, 12_000); // keep the prompt within a small local model's context

  const llm = GRAPH_CONFIG.llm;
  const prompt =
    `${PROMPT}\n\nRespond with ONLY the JSON array, no commentary.\n\n` +
    `PAGE CONTENT:\n${text}`;
  const ollamaResp = await fetch(`${llm.base_url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: llm.model.replace(/^ollama\//, ''),
      prompt,
      stream: false,
      options: { temperature: llm.temperature },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!ollamaResp.ok) {
    const body = await ollamaResp.text().catch(() => '');
    throw new Error(`ollama generate -> HTTP ${ollamaResp.status} ${body.slice(0, 300)}`);
  }
  const data = await ollamaResp.json();
  const raw = (data.response || '').trim();
  const parsed = tryParseJson(raw);

  const elapsed = (Date.now() - started) / 1000;
  return [parsed ?? raw, elapsed];
}

async function main() {
  const [result, elapsed] = await runScraper();
  console.log(
    JSON.stringify(
      { engine: 'scrapegraphai-equivalent-node', elapsed_sec: Math.round(elapsed * 100) / 100, result },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(String(err && err.stack ? err.stack : err));
    process.exit(1);
  });
}
