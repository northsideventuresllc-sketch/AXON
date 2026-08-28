// lib/axon-router/adapters/ollama-local.mjs
//
// POST http://localhost:11434/api/generate — no auth. Connection-refused
// (daemon down) maps to `transport`, never `provider`. Spec §1.

import {
  makeHttpError,
  makeProviderError,
  makeTimeoutError,
  makeTransportError,
} from './errors.mjs';

const ROUTE = 'ollama-local';
// Cold model load on the mini (16GB M1) can exceed 60s — a 9B pulled from disk
// into unified memory is slow the first time. This route is the step-7 last
// resort, so a cold-start timeout would drop the floor out at exactly the moment
// everything above it is already failing. Measured 2026-08-28: first call timed
// out at 30s, warm call returned in ~2s.
const DEFAULT_TIMEOUT_MS = 180_000;
const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export async function send(request) {
  const { prompt, model, timeoutMs = DEFAULT_TIMEOUT_MS, systemPrompt } = request;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  let res;
  try {
    res = await fetch(`${BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return makeTimeoutError({
        route: ROUTE,
        message: `ollama-local timed out after ${timeoutMs}ms`,
        raw: String(err),
      });
    }
    // Connection-refused / DNS / any other network failure -> transport,
    // never provider (daemon down is not the model's fault).
    return makeTransportError({
      route: ROUTE,
      message: err?.message || 'ollama-local transport failure (is the daemon running?)',
      raw: String(err),
    });
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - start;
  const bodyText = await res.text();
  let data;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    return makeHttpError({
      route: ROUTE,
      httpStatus: res.status,
      message: data?.error || `ollama-local HTTP ${res.status}`,
      raw: data ?? bodyText,
    });
  }

  const text = data?.response;
  if (typeof text !== 'string' || !text.length) {
    return makeProviderError({
      route: ROUTE,
      message: 'ollama-local returned a 2xx response with no usable text',
      raw: data ?? bodyText,
    });
  }

  return {
    ok: true,
    text,
    route: ROUTE,
    model,
    usage: {
      inputTokens: data?.prompt_eval_count ?? null,
      outputTokens: data?.eval_count ?? null,
    },
    latencyMs,
    raw: data,
  };
}
