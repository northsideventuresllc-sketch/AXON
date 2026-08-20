/**
 * AXON-TIER-SYSTEM (2026-08-20, JB direct order): the RunPod tier — AXON v1, NVG's own
 * fine-tuned model (Qwen3-Coder-30B-A3B-Instruct, per NI-Brain Decision #1261). Sits
 * between AXON-local (Mac-mini Ollama, axon-local-relay.mjs) and Gemini in the
 * canonical, org-wide tier order: Local -> RunPod (AXON v1) -> Gemini primary ->
 * Gemini backup -> Anthropic/Claude (last resort, most expensive).
 *
 * NOT deployed yet as of this write (2026-08-20) — RUNPOD_AXON_V1_ENDPOINT and
 * RUNPOD_AXON_V1_KEY do not exist in `ni_platform_secrets` yet. Until both are added
 * this function is a documented no-op: it detects the missing config and returns
 * `null` immediately without attempting any network call, so every caller falls
 * through to Gemini exactly as it did before this change (logs once via
 * console.warn, no retry loop). Once RunPod is live, adding both keys to
 * `ni_platform_secrets` activates this tier with no further code change.
 *
 * Same contract as `callAxonLocal` in axon-local-relay.mjs: same params shape
 * (supabaseKey, system, messagesOrUser), returns `Promise<string|null>`, and never
 * throws — callers get `null` on ANY failure/timeout/non-2xx/missing-config so they
 * can fall through cleanly to the next tier.
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const RUNPOD_TIMEOUT_MS = 40_000;

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
