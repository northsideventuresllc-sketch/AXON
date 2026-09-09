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
  // Sanity-checked current as of this change (AX-CHAIN-SUBSCRIPTION-TIERS-0909) — `claude -p
  // '<prompt>' --output-format json` is the Claude Code CLI's documented non-interactive
  // mode and returns a single JSON object with a top-level `result` field.
  claude: {
    build: (prompt) => `claude -p ${shellQuote(prompt)} --output-format json`,
    // claude -p --output-format json → { "result": "..." }
    extract: (stdout) => pick(stdout, (o) => o.result ?? o.text ?? o.content),
  },
  // UNCERTAIN, flagged rather than guessed (task point 4): current Codex CLI docs
  // (developers.openai.com/codex/noninteractive, checked 2026-09-09) describe `codex exec
  // --json` as emitting a JSONL *event stream* on stdout (one JSON object per line — start,
  // tool-call, token, completion events, etc.), not the single `{result: ...}`-shaped object
  // this extract() assumes. JSON.parse() on multi-line stdout will throw, and pick()'s
  // catch-all then returns the *raw* JSONL blob as the "reply" text — which is very likely
  // wrong (a dump of event JSON, not the final answer). This lane has NOT been run against a
  // real `codex` binary this session (no mini available here) so the exact event schema
  // (which event type/field carries the final message) is not confirmed — do not guess it.
  // Left as-is on purpose; needs real verification on JB's mini before this lane is trusted.
  codex: {
    build: (prompt) => `codex exec ${shellQuote(prompt)} --json`,
    extract: (stdout) => pick(stdout, (o) => o.result ?? o.output ?? o.text ?? o.content),
  },
  // Google retired the old `gemini` CLI on 2026-06-18 for Pro/Ultra subscribers — the old
  // `gemini -p '<prompt>'` invocation this spec used to build is dead
  // (antigravity.google/docs/cli/gcli-migration). Its replacement is the Antigravity CLI,
  // binary `agy` (antigravity.google/docs/cli/headless/, checked 2026-09-09):
  //   agy -p '<prompt>' --output-format json --print-timeout 35s
  // -p/--print/--prompt runs one prompt non-interactively and exits; --output-format json
  // returns a single JSON envelope — confirmed (two independent doc fetches) to carry the
  // answer text in a top-level `response` field, alongside conversation_id/status/error/
  // duration_seconds/usage. No --model flag is passed: docs state an unrecognized model slug
  // exits non-zero instead of falling back, and no real current Antigravity model slug has
  // been confirmed from primary docs, so the CLI's own signed-in default is used rather than
  // guessing one. --print-timeout 35s bounds it under this lane's own 40s mini-job timeout
  // (MINI_CMD_TIMEOUT_S) as a second guard: reported bug, headless `agy -p` can hang
  // indefinitely in a non-TTY/subprocess environment (google-antigravity/antigravity-cli#318)
  // — exactly the shape a mini shell job runs in, so the job-level timeout alone is not
  // trusted to be the only backstop. UNPROVEN END-TO-END: JB has not installed Antigravity
  // yet (task background), so this has been verified against Antigravity's own current docs
  // only, never run against a real `agy` binary. Key name kept as "gemini" for backward
  // compatibility with any code/data that already resolved this token
  // (SUPPORTED_SUBSCRIPTION_CLIS et al.); the `gemini-subscription` router_routes row now
  // points its cli_command at "antigravity" instead — see the alias comment below.
  antigravity: {
    build: (prompt) => `agy -p ${shellQuote(prompt)} --output-format json --print-timeout 35s`,
    extract: (stdout) => pick(stdout, (o) => o.response ?? o.result ?? o.text ?? o.content),
  },
};

// Back-compat alias: any already-persisted router_routes.cli_command = 'gemini' row (this
// repo's own value before db/axon-v0/006_subscription_chain_tiers.sql updates it to
// 'antigravity') still resolves instead of silently becoming `{ unavailable: ... "No CLI
// recipe" }` between the code deploy and the migration actually landing.
CLI_SPECS.gemini = CLI_SPECS.antigravity;

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
