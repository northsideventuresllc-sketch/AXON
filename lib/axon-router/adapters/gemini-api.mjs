// lib/axon-router/adapters/gemini-api.mjs
//
// POST generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…
// Key goes in the QUERY STRING, not a header. Text from
// candidates[0].content.parts[0].text; usage from usageMetadata (different
// field names — normalized explicitly). Spec §1.

import { getSecret } from './secrets.mjs';
import {
  makeHttpError,
  makeProviderError,
  makeTimeoutError,
  makeTransportError,
} from './errors.mjs';

const ROUTE = 'gemini-api';
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

  const apiKey = await getSecret('GEMINI_API_KEY');
  if (!apiKey) {
    return makeTransportError({
      route: ROUTE,
      message: 'GEMINI_API_KEY not configured (env or ni_platform_secrets)',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(systemPrompt
          ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
          : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return makeTimeoutError({
        route: ROUTE,
        message: `gemini-api timed out after ${timeoutMs}ms`,
        raw: String(err),
      });
    }
    return makeTransportError({
      route: ROUTE,
      message: err?.message || 'gemini-api transport failure',
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
      message: data?.error?.message || `gemini-api HTTP ${res.status}`,
      raw: data ?? bodyText,
    });
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p?.text || '')
    .join('')
    .trim();

  if (!text) {
    return makeProviderError({
      route: ROUTE,
      message: 'gemini-api returned a 2xx response with no usable text',
      raw: data ?? bodyText,
    });
  }

  const usageMeta = data?.usageMetadata;

  return {
    ok: true,
    text,
    route: ROUTE,
    model,
    usage: {
      inputTokens: usageMeta?.promptTokenCount ?? null,
      outputTokens: usageMeta?.candidatesTokenCount ?? null,
    },
    latencyMs,
    raw: data,
  };
}
