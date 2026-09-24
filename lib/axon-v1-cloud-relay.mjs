/**
 * AXON-TIER-SYSTEM (2026-08-20, JB direct order): the RunPod tier — AXON v1, NVG's own
 * fine-tuned model (Qwen3-Coder-30B-A3B-Instruct, per NI-Brain Decision #1261). Sits
 * between AXON-local (Mac-mini Ollama, axon-local-relay.mjs) and Gemini in the
 * canonical, org-wide tier order: Local -> RunPod (AXON v1) -> Gemini primary ->
 * Gemini backup -> Anthropic/Claude (last resort, most expensive).
 *
 * DEPLOYED AND LIVE since 2026-08-26/28 — RUNPOD_AXON_V1_ENDPOINT and RUNPOD_AXON_V1_KEY
 * are set in `ni_platform_secrets` and the endpoint answers real calls. This is a PAID,
 * pay-per-use, scale-to-zero tier (pennies per call, min workers 0, no always-warm
 * worker — NI-Brain Decision #1813), not a free tier. Corrected 2026-09-24 per Decision
 * #2001 (JB direct: fix every rule line still calling RunPod "free"); the "not deployed
 * yet" wording this comment used to carry was stale. This function still returns `null`
 * on missing config (so a genuinely unconfigured environment falls through to Gemini
 * cleanly, logged once via console.warn, no retry loop) and on a live call failure, such
 * as the negative RunPod account balance tracked in AX-RUNPOD-ZERO-SUCCESS-0915.
 *
 * Same contract as `callAxonLocal` in axon-local-relay.mjs: same params shape
 * (supabaseKey, system, messagesOrUser), returns `Promise<string|null>`, and never
 * throws — callers get `null` on ANY failure/timeout/non-2xx/missing-config so they
 * can fall through cleanly to the next tier.
 */

import { logRelayMetric } from './relay-metrics.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const RUNPOD_TIMEOUT_MS = 40_000;

// Log the missing-config warning once per process, not once per call — avoids
// flooding logs in environments where RunPod's paid endpoint secrets aren't configured.
let warnedMissingConfig = false;

function sbHeaders(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
}

async function loadSecret(supabaseKey, key) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ni_platform_secrets?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
      { headers: { ...sbHeaders(supabaseKey), Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.value || null;
  } catch {
    return null;
  }
}

function buildPrompt(system, messages) {
  const convo = messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n');
  return `${system}\n\n${convo}\nAssistant:`;
}

/**
 * Try AXON v1 (NVG's fine-tuned Qwen3-Coder-30B-A3B-Instruct) hosted on RunPod.
 * @param {string} supabaseKey
 * @param {string} system
 * @param {{role: string, content: string}[] | string} messagesOrUser - message array, or a single user string
 * @returns {Promise<string|null>}
 */
export async function callAxonV1Cloud(supabaseKey, system, messagesOrUser) {
  if (!supabaseKey) return null;

  const [endpoint, apiKey] = await Promise.all([
    loadSecret(supabaseKey, 'RUNPOD_AXON_V1_ENDPOINT'),
    loadSecret(supabaseKey, 'RUNPOD_AXON_V1_KEY'),
  ]);

  if (!endpoint || !apiKey) {
    if (!warnedMissingConfig) {
      console.warn(
        'callAxonV1Cloud: RUNPOD_AXON_V1_ENDPOINT/RUNPOD_AXON_V1_KEY not set in ni_platform_secrets — AXON v1 (RunPod, a paid pay-per-use tier, not free) unconfigured in this environment, falling through to Gemini',
      );
      warnedMissingConfig = true;
    }
    return null;
  }

  const relayStart = Date.now();
  const text = await callAxonV1CloudAttempt(endpoint, apiKey, system, messagesOrUser);
  await logRelayMetric(supabaseKey, { tier: 'runpod', success: text !== null, durationMs: Date.now() - relayStart });
  return text;
}

async function callAxonV1CloudAttempt(endpoint, apiKey, system, messagesOrUser) {
  const messages =
    typeof messagesOrUser === 'string' ? [{ role: 'user', content: messagesOrUser }] : messagesOrUser;
  const prompt = buildPrompt(system, messages);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUNPOD_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'axon-v1',
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text =
      (typeof data.response === 'string' && data.response)
      || (typeof data.text === 'string' && data.text)
      || (typeof data.choices?.[0]?.text === 'string' && data.choices[0].text)
      || (typeof data.choices?.[0]?.message?.content === 'string' && data.choices[0].message.content)
      || null;
    return text ? text.trim() : null;
  } catch {
    return null; // network error, abort/timeout, bad JSON — caller falls through
  } finally {
    clearTimeout(timer);
  }
}
