/**
 * AXON-EVERYWHERE-PROJECT (2026-08-05): the tunnel for cloud -> Mac-mini AXON-local calls.
 * No new infra — reuses nvg_mini_jobs (Supabase queue the mini already polls via
 * nvg-mini-runner.py, proven live for git relay 2026-08-05 Decision #599) as an async
 * request/response bridge to the Ollama server on the mini. Proven end-to-end with a real
 * generation 2026-08-05 (Learning #3585) — this is not a status flag, it returns real text.
 *
 * Callers get `null` on any failure/timeout so they can fall through to the next tier
 * (Gemini main, Gemini backup, then Anthropic last) without throwing.
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const MINI_RELAY_MODEL = 'axon-ornith:latest';
// AX-RELAY-TIMEOUT-FIX-0828 (NI-Brain Decision #1503): 40s was too short for real
// /api/generate calls under mini disk/load pressure — measured 78% failure rate
// (curl exit 28) over a 48h trailing sample, 2026-08-28. Raised to 120s, with the
// caller's own wait budget raised to match so the longer curl timeout is actually
// usable instead of being abandoned early by the poll loop.
const MINI_RELAY_MAX_WAIT_MS = 130_000;
const MINI_RELAY_POLL_MS = 2_500;
const MINI_RELAY_CMD_TIMEOUT_S = 120;

function sbHeaders(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
}

function buildPrompt(system, messages) {
  const convo = messages
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n');
  return `${system}\n\n${convo}\nAssistant:`;
}

/**
 * Try AXON's own local model (Mac mini, Ollama) via the mini job-queue relay.
 * @param {string} supabaseKey
 * @param {string} system
 * @param {{role: string, content: string}[] | string} messagesOrUser - message array, or a single user string
 * @returns {Promise<string|null>}
 */
export async function callAxonLocal(supabaseKey, system, messagesOrUser) {
  if (!supabaseKey) return null;

  const messages =
    typeof messagesOrUser === 'string' ? [{ role: 'user', content: messagesOrUser }] : messagesOrUser;
  const prompt = buildPrompt(system, messages);
  // think:false is required — axon-ornith is a thinking-capable model (qwen3.5 base) that
  // otherwise puts its entire answer in the `thinking` field and leaves `response` empty,
  // which silently looked like "AXON unreachable" and fell through to Gemini every time.
  // Found + fixed 2026-08-05 during the first live proof run (Learning #3625).
  const ollamaBody = JSON.stringify({ model: MINI_RELAY_MODEL, prompt, stream: false, think: false });
  const cmd = `curl -s -m ${MINI_RELAY_CMD_TIMEOUT_S} http://localhost:11434/api/generate -d ${JSON.stringify(
    ollamaBody,
  )}`;

  let jobId = null;
  try {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/nvg_mini_jobs`, {
      method: 'POST',
      headers: { ...sbHeaders(supabaseKey), Prefer: 'return=representation' },
      body: JSON.stringify({
        kind: 'shell',
        title: 'axon-local-relay',
        payload: { cmd, timeout: MINI_RELAY_CMD_TIMEOUT_S + 5 },
        status: 'queued',
      }),
    });
    if (!insertRes.ok) return null;
    const rows = await insertRes.json();
    jobId = Array.isArray(rows) ? rows[0]?.id : rows?.id;
  } catch {
    return null;
  }
  if (!jobId) return null;

  const deadline = Date.now() + MINI_RELAY_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, MINI_RELAY_POLL_MS));
    try {
      const pollRes = await fetch(
        `${SUPABASE_URL}/rest/v1/nvg_mini_jobs?id=eq.${jobId}&select=status,result,error`,
        { headers: { ...sbHeaders(supabaseKey), Accept: 'application/json' } },
      );
      if (!pollRes.ok) continue;
      const rows = await pollRes.json();
      const row = rows?.[0];
      if (!row) continue;

      if (row.status === 'failed') return null;
      if (row.status !== 'done') continue;

      const stdout = row.result?.stdout;
      if (!stdout) return null;
      try {
        const parsed = JSON.parse(stdout);
        const text = typeof parsed.response === 'string' ? parsed.response.trim() : null;
        return text || null;
      } catch {
        return null;
      }
    } catch {
      // transient poll error — keep trying until deadline
    }
  }
  return null; // timed out — caller falls through to the next tier
}
