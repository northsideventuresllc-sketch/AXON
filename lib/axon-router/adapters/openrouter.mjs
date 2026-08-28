// lib/axon-router/adapters/openrouter.mjs
//
// OpenAI-compatible POST https://openrouter.ai/api/v1/chat/completions,
// `Authorization: Bearer`. Text from choices[0].message.content. A bad model
// id is a runtime 400, not a config error. OpenRouter can also return HTTP
// 200 with an `error` object in the body — that must be caught as a
// `provider` error, not treated as a false success. Spec §1.

import { getSecret } from './secrets.mjs';
import {
  makeHttpError,
  makeProviderError,
  makeTimeoutError,
  makeTransportError,
} from './errors.mjs';

const ROUTE = 'openrouter';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 1024;

// GOTCHA (measured 2026-08-28): several OpenRouter models are reasoning models
// that spend their token budget on hidden `reasoning` output before emitting any
// visible content. deepseek/deepseek-v4-flash at maxTokens=20 returns
// finish_reason:"length" with message.content=null — which this adapter correctly
// reports as a `provider` error rather than a false success. The same model at
// maxTokens=2000 answers in 598ms. Do not diagnose these models with tiny budgets,
// and do not seed callers with a low maxTokens; callChatModel passes 2000.
export async function send(request) {
  const {
    prompt,
    model,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    systemPrompt,
  } = request;

  const apiKey = await getSecret('OPENROUTER_API_KEY');
  if (!apiKey) {
    return makeTransportError({
      route: ROUTE,
      message: 'OPENROUTER_API_KEY not configured (env or ni_platform_secrets)',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return makeTimeoutError({
        route: ROUTE,
        message: `openrouter timed out after ${timeoutMs}ms`,
        raw: String(err),
      });
    }
    return makeTransportError({
      route: ROUTE,
      message: err?.message || 'openrouter transport failure',
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
      message: data?.error?.message || `openrouter HTTP ${res.status}`,
      raw: data ?? bodyText,
    });
  }

  // OpenRouter can return HTTP 200 with an `error` object in the body (e.g.
  // upstream provider failure surfaced through OpenRouter's own routing) —
  // that is a provider failure, not a success, even though res.ok is true.
  if (data?.error) {
    return makeProviderError({
      route: ROUTE,
      message: data.error?.message || 'openrouter returned a 2xx response with an error body',
      raw: data,
    });
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.length) {
    return makeProviderError({
      route: ROUTE,
      message: 'openrouter returned a 2xx response with no usable text',
      raw: data ?? bodyText,
    });
  }

  return {
    ok: true,
    text,
    route: ROUTE,
    model,
    usage: {
      inputTokens: data?.usage?.prompt_tokens ?? null,
      outputTokens: data?.usage?.completion_tokens ?? null,
    },
    latencyMs,
    raw: data,
  };
}
