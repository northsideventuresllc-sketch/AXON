/**
 * Subscription lanes.
 *
 * THE CONSTRAINT, stated once so nobody re-litigates it: a consumer subscription
 * (Claude Max/Pro, ChatGPT Plus/Pro/Team, Google AI Pro/Ultra) has NO HTTP API. A ChatGPT
 * subscription in particular can never be reached with an API key — subscription billing
 * and API billing are separate worlds. The only way an agent can spend a subscription is
 * the vendor's own CLI, signed into the account, on a machine the operator controls.
 *
 * So a subscription lane is a shell job on the Mac mini, over the same nvg_mini_jobs queue
 * the Ollama lane already uses.
 *
 * For an account with no mini (axon_accounts.has_mini_access = false) this returns an
 * explicit `unavailable` result with a reason the UI shows on a disabled connector card.
 * That is an honest capability boundary — not a hidden failure, and not a fake lane.
 */

import { queueMiniShellJob, MINI_CMD_TIMEOUT_S } from './nvg-mini-queue.mjs';

/**
 * Non-interactive invocations per vendor CLI.
 *
 * TODO(verify-on-mini): these flags are correct for the CLI versions documented at time of
 * writing, but vendor CLI flags drift between releases. Before trusting a lane in
 * production, run `<cli> --help` on the mini and confirm. Do not silently guess a flag —
 * a wrong flag looks identical to an unreachable subscription.
 */
const CLI_SPECS = {
  claude: {
    build: (prompt) => `claude -p ${shellQuote(prompt)} --output-format json`,
    // claude -p --output-format json → { "result": "..." }
    extract: (stdout) => pick(stdout, (o) => o.result ?? o.text ?? o.content),
  },
  codex: {
    build: (prompt) => `codex exec ${shellQuote(prompt)} --json`,
    extract: (stdout) => pick(stdout, (o) => o.result ?? o.output ?? o.text ?? o.content),
  },
  gemini: {
    build: (prompt) => `gemini -p ${shellQuote(prompt)}`,
    // Gemini CLI prints plain text in -p mode.
    extract: (stdout) => (stdout || '').trim() || null,
  },
};

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function pick(stdout, getter) {
  const raw = (stdout || '').trim();
  if (!raw) return null;
  try {
    const value = getter(JSON.parse(raw));
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    // Some CLI versions print plain text even when asked for JSON. Prefer real output
    // over a parse failure.
    return raw;
  }
}

function flattenPrompt(system, messages) {
  const convo = (messages || [])
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n');
  return system ? `${system}\n\n${convo}` : convo;
}

/**
 * @param {string} supabaseKey
 * @param {{cliCommand: string, system?: string, messages: Array, hasMini: boolean}} args
 * @returns {Promise<{reply: string}|{unavailable: true, reason: string}|null>}
 */
export async function callSubscriptionCli(supabaseKey, { cliCommand, system, messages, hasMini }) {
  const spec = CLI_SPECS[cliCommand];
  if (!spec) {
    return { unavailable: true, reason: `No CLI recipe for "${cliCommand}".` };
  }
  if (!hasMini) {
    // Return immediately. No network call, no queued job, no pretending.
    return {
      unavailable: true,
      reason:
        'This lane runs a subscription through its own command-line app, which needs a machine ' +
        'signed into that subscription. This account has none connected — add an API-key ' +
        'connector for this provider instead.',
    };
  }

  const stdout = await queueMiniShellJob(supabaseKey, spec.build(flattenPrompt(system, messages)), {
    title: `axon-subscription-${cliCommand}`,
    timeoutS: MINI_CMD_TIMEOUT_S,
  });
  if (stdout === null) return null; // timeout or queue failure — caller falls through

  const reply = spec.extract(stdout);
  return reply ? { reply } : null;
}

export const SUPPORTED_SUBSCRIPTION_CLIS = Object.keys(CLI_SPECS);
