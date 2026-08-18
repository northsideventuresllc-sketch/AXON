/**
 * AXON-OMNI-ROUTER-REBUILD-001 — increment 1: shared failover router.
 *
 * SCOPE OF THIS INCREMENT (honest, not the whole epic):
 *   - Unifies the ad-hoc local -> Gemini -> Anthropic cascade that already existed
 *     scattered across lib/ai.mjs and lib/axon-local-relay.mjs into ONE reusable
 *     callWithFailover() any route/script in this repo (or portal-integration) can call.
 *   - Providers tried in priority order; a provider that throws or returns empty/null
 *     is skipped and the next one is tried. Every attempt (ok or failed) is recorded
 *     and returned, so a caller/UI can show "which provider actually answered."
 *
 * EXPLICITLY NOT DONE YET (do not report as complete):
 *   - No DeepSeek or Cursor provider wired in — PROVIDERS below only covers axon-local,
 *     Claude (Anthropic), and Gemini, which is what the codebase already had live.
 *     Adding DeepSeek/Cursor is a follow-up increment (needs their API shapes + keys).
 *   - This module does not yet replace the call sites in lib/ai.mjs (haikuScanProspect,
 *     scanProspect, etc) — those keep working exactly as before, untouched, so this
 *     ships with zero regression risk to the live outreach pipeline. Migrating those
 *     call sites onto callWithFailover() is a separate follow-up, not bundled here.
 *   - No canary/internal-vs-public staged release mechanism (that's AXON-VERSION-STAGING-001,
 *     a different queued ticket).
 *
 * Callers can override providers/order for testing via opts.providers / opts.order —
 * see tests/omni-router.test.mjs for fully offline unit tests (no real network calls).
 */

import { callAxonLocal } from './axon-local-relay.mjs';

/** Capability metadata — for a future Dash "which model answered" UI, not just internal use. */
export const PROVIDERS = [
  { id: 'local', label: 'AXON Local (Mac-mini Ollama)', requiresKey: false },
  { id: 'claude', label: 'Claude (Anthropic)', requiresKey: true, envKey: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', label: 'Gemini', requiresKey: true, envKey: 'GEMINI_API_KEY' },
];

export const DEFAULT_ORDER = ['local', 'claude', 'gemini'];

async function callClaude(system, user, opts = {}) {
  const apiKey = opts.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const model = opts.claudeModel || process.env.AXON_ROUTER_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens || 1200,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const text = data.content?.map((c) => c.text || '').join('').trim();
  if (!text) throw new Error('Anthropic empty response');
  return text;
}

async function callGemini(system, user, opts = {}) {
  const apiKey = opts.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const model = opts.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens || 1024, temperature: 0.2 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim();
  if (!text) throw new Error('Gemini empty response');
  return text;
}

async function callLocal(system, user, opts = {}) {
  const supabaseKey = opts.supabaseKey || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_KEY missing (required to reach the mini relay)');
  const text = await callAxonLocal(supabaseKey, system, user);
  if (!text) throw new Error('axon-local returned null (relay timeout, mini offline, or model error)');
  return text;
}

const BUILTIN_CALLERS = { local: callLocal, claude: callClaude, gemini: callGemini };

/**
 * Try each provider in order; return the first success plus a full attempt log.
 * Never throws for an individual provider failure — only throws once every
 * provider in the order has been tried and none produced text.
 *
 * @param {string} system
 * @param {string} user
 * @param {{
 *   order?: string[],           // override DEFAULT_ORDER
 *   providers?: Record<string, (system, user, opts) => Promise<string>>, // override/inject for tests
 *   [key: string]: any,          // forwarded to each provider caller as `opts`
 * }} [opts]
 * @returns {Promise<{ text: string, provider: string, attempts: Array<{provider: string, ok: boolean, error?: string}> }>}
 */
export async function callWithFailover(system, user, opts = {}) {
  const order = opts.order?.length ? opts.order : DEFAULT_ORDER;
  const callers = { ...BUILTIN_CALLERS, ...(opts.providers || {}) };
  const attempts = [];

  for (const providerId of order) {
    const caller = callers[providerId];
    if (!caller) {
      attempts.push({ provider: providerId, ok: false, error: 'no caller registered for this provider id' });
      continue;
    }
    try {
      const text = await caller(system, user, opts);
      attempts.push({ provider: providerId, ok: true });
      return { text, provider: providerId, attempts };
    } catch (err) {
      attempts.push({ provider: providerId, ok: false, error: String(err?.message || err) });
    }
  }

  const summary = attempts.map((a) => `${a.provider}: ${a.ok ? 'ok' : a.error}`).join(' | ');
  throw new Error(`callWithFailover: every provider in order [${order.join(', ')}] failed — ${summary}`);
}
