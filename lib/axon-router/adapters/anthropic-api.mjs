// lib/axon-router/adapters/anthropic-api.mjs
//
// POST api.anthropic.com/v1/messages — `x-api-key` header, `anthropic-version`
// required. Text from content[0].text. Spec §1.

import { getSecret } from './secrets.mjs';
import {
  makeHttpError,
  makeProviderError,
  makeTimeoutError,
  makeTransportError,
} from './errors.mjs';

const ROUTE = 'anthropic-api';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 1024;

export async function send(request) {
  const {
    prompt,
    model,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    systemPrompt,
  } = request;

  const apiKey = await getSecret('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return makeTransportError({
      route: ROUTE,
      message: 'ANTHROPIC_API_KEY not configured (env or ni_platform_secrets)',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return makeTimeoutError({
        route: ROUTE,
        message: `anthropic-api timed out after ${timeoutMs}ms`,
        raw: String(err),
      });
    }
    return makeTransportError({
      route: ROUTE,
      message: err?.message || 'anthropic-api transport failure',
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
      message: data?.error?.message || `anthropic-api HTTP ${res.status}`,
      raw: data ?? bodyText,
    });
  }

  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string' || !text.length) {
    return makeProviderError({
      route: ROUTE,
      message: 'anthropic-api returned a 2xx response with no usable text',
      raw: data ?? bodyText,
    });
  }

  return {
    ok: true,
    text,
    route: ROUTE,
    model,
    usage: {
      inputTokens: data?.usage?.input_tokens ?? null,
      outputTokens: data?.usage?.output_tokens ?? null,
    },
    latencyMs,
    raw: data,
  };
}
