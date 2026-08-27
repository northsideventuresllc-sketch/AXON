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

import { enqueueMiniShellJob, pollMiniJob } from './axon-mini-relay.mjs';

const MINI_RELAY_MODEL = 'axon-ornith:latest';
const MINI_RELAY_MAX_WAIT_MS = 45_000;
const MINI_RELAY_POLL_MS = 2_500;
const MINI_RELAY_CMD_TIMEOUT_S = 40;

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

  const jobId = await enqueueMiniShellJob(supabaseKey, {
    title: 'axon-local-relay',
    cmd,
    timeout: MINI_RELAY_CMD_TIMEOUT_S + 5,
  });
  if (!jobId) return null;

  const outcome = await pollMiniJob(supabaseKey, jobId, {
    maxWaitMs: MINI_RELAY_MAX_WAIT_MS,
    pollMs: MINI_RELAY_POLL_MS,
  });
  if (outcome.status !== 'done') return null; // failed or timed out — caller falls through to the next tier

  const stdout = outcome.result?.stdout;
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout);
    const text = typeof parsed.response === 'string' ? parsed.response.trim() : null;
    return text || null;
  } catch {
    return null;
  }
}
