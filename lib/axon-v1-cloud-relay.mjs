/**
 * AXON-TIER-SYSTEM (2026-08-20, JB direct order): the RunPod tier — AXON v1, NVG's own
 * fine-tuned model (Qwen3-Coder-30B-A3B-Instruct, per NI-Brain Decision #1261). Sits
 * between AXON-local (Mac-mini Ollama, axon-local-relay.mjs) and Gemini in the
 * canonical, org-wide tier order: Local -> RunPod (AXON v1) -> Gemini primary ->
 * Gemini backup -> Anthropic/Claude (last resort, most expensive).
 *
 * STALE COMMENT REMOVED (2026-09-16, AX-RUNPOD-ZERO-SUCCESS-0915): this used to say
 * "NOT deployed yet" — false since 2026-08-20, both secrets have been live in
 * `ni_platform_secrets` the whole time. The real, live-diagnosed problem (this session
 * was the first to actually reach api.runpod.ai with the real key — two prior attempts,
 * PR #205's own Learning #8471 and the 2026-09-15 ponder run, were both blocked by their
 * sandbox's outbound network) was TWO separate bugs stacked on top of each other:
 *
 *   1. THIS FILE never spoke RunPod's actual serverless contract. It POSTed the flat
 *      Ollama-style body `{model, prompt, stream}` straight to the base endpoint URL —
 *      confirmed live to return an instant `404 page not found` (0.5s, not a 40s
 *      timeout). RunPod requires POSTing to `${endpoint}/run` (async) with the payload
 *      wrapped as `{"input": {...}}`, then polling `${endpoint}/status/{id}`. Fixed
 *      below.
 *   2. Even calling the endpoint correctly, the live RunPod endpoint itself
 *      (`axon-v1-beta-flashboot-test`, template `axon-v1-beta-qwen3-coder-30b-fp8`) does
 *      not work: a correctly-shaped job sits `IN_QUEUE` forever (proven live — one job
 *      watched for 280s straight, never left `IN_QUEUE`) while `/health` reports a
 *      worker sitting `idle`+`ready` the entire time and a job backlog that only grows
 *      (23 -> 26 `inQueue` during this session's testing; lifetime `completed` count is
 *      1). The endpoint's own GPU filter (`AMPERE_48,-NVIDIA A40,ADA_48_PRO` — requests
 *      the Ampere-48GB class while explicitly excluding the A40, which IS an Ampere-48GB
 *      card) is a plausible resource-starvation cause, but confirming/fixing that needs
 *      the RunPod dashboard (redeploy or reconfigure the endpoint), which this code
 *      change cannot do and which may carry a GPU-hour cost — a JB/infra-authorized call,
 *      not a code fix. See AX-RUNPOD-ZERO-SUCCESS-0915 result_summary for the full
 *      diagnostic trail (both bugs, both proofs).
 *
 * Bug 1 is fixed in this file. Bug 2 is NOT fixed here and this tier will keep returning
 * null (falling through to Gemini, exactly as designed) until the RunPod-side issue is
 * resolved — this file's own timeout+cancel logic cannot make a wedged endpoint respond.
 *
 * Same contract as `callAxonLocal` in axon-local-relay.mjs: same params shape
 * (supabaseKey, system, messagesOrUser), returns `Promise<string|null>`, and never
 * throws — callers get `null` on ANY failure/timeout/non-2xx/missing-config so they
 * can fall through cleanly to the next tier.
 */

import { logRelayMetric } from './relay-metrics.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
// Budget for the whole job (submit + poll), not just one HTTP call — RunPod serverless
// jobs are async by nature (cold start can genuinely take tens of seconds), so a single
// short AbortController on one fetch (the old bug) can't express "wait for the job."
const RUNPOD_SUBMIT_TIMEOUT_MS = 15_000;
const RUNPOD_POLL_BUDGET_MS = 40_000;
const RUNPOD_POLL_INTERVAL_MS = 2_000;
const RUNPOD_STATUS_TIMEOUT_MS = 10_000;
const RUNPOD_CANCEL_TIMEOUT_MS = 5_000;

// Log the missing-config warning once per process, not once per call — avoids
// flooding logs while RunPod isn't deployed yet.
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
        'callAxonV1Cloud: RUNPOD_AXON_V1_ENDPOINT/RUNPOD_AXON_V1_KEY not set in ni_platform_secrets — AXON v1 (RunPod) tier not deployed yet, falling through to Gemini',
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

function extractRunpodText(output) {
  // RunPod's worker-v1-vllm output shape varies by version/route; try every documented
  // and observed shape rather than assuming one. Never throw — an unrecognized shape
  // just falls through to null like any other failure.
  if (output == null) return null;
  const candidates = Array.isArray(output) ? output : [output];
  for (const item of candidates) {
    const text =
      (typeof item === 'string' && item)
      || (typeof item?.text === 'string' && item.text)
      || (typeof item?.response === 'string' && item.response)
      || (typeof item?.choices?.[0]?.text === 'string' && item.choices[0].text)
      || (typeof item?.choices?.[0]?.message?.content === 'string' && item.choices[0].message.content)
      || (Array.isArray(item?.choices?.[0]?.tokens) && item.choices[0].tokens.join(''))
      || null;
    if (text) return text.trim();
  }
  return null;
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callAxonV1CloudAttempt(endpoint, apiKey, system, messagesOrUser) {
  const messages =
    typeof messagesOrUser === 'string' ? [{ role: 'user', content: messagesOrUser }] : messagesOrUser;
  const prompt = buildPrompt(system, messages);
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  let jobId = null;
  try {
    let submitData;
    try {
      const submitRes = await fetchWithTimeout(
        `${endpoint}/run`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ input: { prompt, sampling_params: { max_tokens: 1024 } } }),
        },
        RUNPOD_SUBMIT_TIMEOUT_MS,
      );
      if (!submitRes.ok) return null;
      submitData = await submitRes.json();
    } catch {
      return null; // network error / abort / bad JSON on submit — nothing to cancel yet
    }

    jobId = submitData?.id || null;
    if (!jobId) return null;
    if (submitData.status === 'COMPLETED') return extractRunpodText(submitData.output);
    if (submitData.status === 'FAILED' || submitData.status === 'CANCELLED') {
      jobId = null; // RunPod already closed it — nothing left to cancel
      return null;
    }

    const deadline = Date.now() + RUNPOD_POLL_BUDGET_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, RUNPOD_POLL_INTERVAL_MS));
      let statusData;
      try {
        const statusRes = await fetchWithTimeout(
          `${endpoint}/status/${jobId}`,
          { headers },
          RUNPOD_STATUS_TIMEOUT_MS,
        );
        if (!statusRes.ok) continue;
        statusData = await statusRes.json();
      } catch {
        continue; // transient poll failure — keep polling within the budget
      }
      if (statusData.status === 'COMPLETED') return extractRunpodText(statusData.output);
      if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
        jobId = null;
        return null;
      }
    }
    return null; // exhausted the poll budget — still IN_QUEUE/IN_PROGRESS, cancel it below
  } catch {
    return null;
  } finally {
    // AX-RUNPOD-ZERO-SUCCESS-0915: the old code never cancelled a timed-out job, so every
    // failed attempt left an orphan sitting IN_QUEUE on RunPod forever — live-diagnosed
    // this session as a real, growing backlog (25+ orphaned jobs found). Best-effort only:
    // this must never throw or block the caller's own null-return contract.
    if (jobId) {
      try {
        await fetchWithTimeout(`${endpoint}/cancel/${jobId}`, { headers }, RUNPOD_CANCEL_TIMEOUT_MS);
      } catch {
        // cleanup is best-effort
      }
    }
  }
}
