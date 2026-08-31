/**
 * AX-MINI-JOBS-NO-TIER-GATE-0813 enforcement.
 *
 * EXEC decision (agent_bus, subject AX-MINI-JOBS-NO-TIER-GATE-0813-ANSWERED,
 * decided_by: EXEC, 2026-08-18):
 *   "risk_tier for a raw shell payload in nvg_mini_jobs = high/privileged by default.
 *    Any payload not matched against an explicit allowlisted command template
 *    auto-classifies high and must NOT auto-execute -- route to needs_jb_approval=true
 *    in agent_dispatch instead. Only pattern-matched, pre-approved command templates
 *    may run at a lower tier autonomously. This is a backend design decision under
 *    EXEC Section-1 authority, not escalated to JB."
 *
 * Before this file existed, nothing on the cloud side read or wrote risk_flag at all
 * (confirmed: zero references in lib/nvg-mini-queue.mjs or lib/axon-local-relay.mjs) --
 * every caller inserted straight into nvg_mini_jobs with status:'queued', which
 * nvg-mini-runner.py (on the Mac mini) polls for and executes. The mini runner itself
 * already does its own defense at execution time (real blocked_needs_jb rows exist with
 * reasons like "irreversible delete outside /tmp" and "force-push ... history-destructive"),
 * but that classification lives outside this repo and is invisible/untestable here. This
 * module is the cloud-side gate the ticket asked for: classify the cmd against the
 * allowlist BEFORE a job is ever written with status:'queued', so an unmatched payload
 * never reaches the mini as something ready to auto-run, regardless of what the mini's
 * own runner would have decided.
 *
 * risk_flag is treated as HIGH whenever classification doesn't produce an explicit
 * allowlist match -- never as an implicit allow. That also covers the "null" case: the
 * 1758 pre-existing nvg_mini_jobs rows with risk_flag IS NULL predate this gate and carry
 * no established "null = safe" meaning anywhere in the codebase (grepped before writing
 * this file: zero reads of risk_flag). A caller here never gets to skip classification by
 * leaving risk_flag unset.
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

/**
 * Allowlisted command TEMPLATES -- the only shapes that may run autonomously.
 * Each pattern is checked as an anchored prefix match against the exact cmd string that
 * would otherwise be queued. Keep this list in lockstep with the templates
 * lib/axon-local-relay.mjs, lib/axon-router-core.mjs (local lane), and
 * lib/axon-subscription-cli.mjs actually build -- do not loosen a pattern to fit a new
 * caller without a matching decision on record.
 */
const ALLOWLISTED_TEMPLATES = [
  // Ollama /api/generate on the mini's own local model -- axon-local-relay.mjs
  // callAxonLocal, and axon-router-core.mjs's "local" connector lane. Fixed host, port,
  // and path; only the JSON body (model + prompt) varies.
  {
    name: 'ollama-local-generate',
    pattern: /^curl -s -m \d+ https?:\/\/(localhost|127\.0\.0\.1):11434\/api\/generate -d /,
  },
  // Vendor subscription CLIs -- lib/axon-subscription-cli.mjs CLI_SPECS. Prompt content is
  // always shell-quoted (shellQuote()) before reaching here, so the template match is on
  // the fixed CLI invocation prefix only.
  { name: 'subscription-cli-claude', pattern: /^claude -p '/ },
  { name: 'subscription-cli-codex', pattern: /^codex exec '/ },
  { name: 'subscription-cli-gemini', pattern: /^gemini -p '/ },
];

/**
 * Classify a shell cmd string against the allowlist.
 * @param {string} cmd
 * @returns {{riskFlag: 'low'|'high', riskReason: string, allowlisted: boolean}}
 */
export function classifyMiniShellRisk(cmd) {
  const match =
    typeof cmd === 'string' ? ALLOWLISTED_TEMPLATES.find((t) => t.pattern.test(cmd)) : null;
  if (match) {
    return {
      riskFlag: 'low',
      riskReason: `matched allowlisted template: ${match.name}`,
      allowlisted: true,
    };
  }
  return {
    riskFlag: 'high',
    riskReason:
      'unmatched shell payload -- no allowlisted command template found ' +
      '(EXEC decision AX-MINI-JOBS-NO-TIER-GATE-0813: unmatched payloads default high, ' +
      'must not auto-execute)',
    allowlisted: false,
  };
}

function sbHeaders(supabaseKey) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Block a high-risk mini shell job instead of letting it queue for auto-execution.
 *
 * Writes two rows:
 *   1. nvg_mini_jobs, status:'blocked_needs_jb' (an already-established status literal on
 *      this table, allowed by nvg_mini_jobs_status_check, and distinct from 'queued' --
 *      nvg-mini-runner.py only ever picks up status:'queued', so this row is never run)
 *      with risk_flag/risk_reason recorded, for parity with how the mini's own runner
 *      already logs the rows it refuses to run.
 *   2. agent_dispatch, needs_jb_approval:true, status:'needs_jb', risk_tier:'jb_only',
 *      executor:'jb_manual' -- the existing tap-to-approve surface (see
 *      lib/nvg-approve-telegram.mjs) JB already uses for gated work, so a blocked job is
 *      actually visible to him instead of silently vanishing.
 *
 * Never throws -- callers treat a block the same as any other queue failure (return null,
 * fall through to the next tier / lane).
 *
 * @param {string} supabaseKey
 * @param {{title?: string, cmd: string, riskFlag: string, riskReason: string}} args
 */
export async function blockUnclassifiedMiniShellJob(supabaseKey, { title, cmd, riskFlag, riskReason }) {
  if (!supabaseKey) return;
  const safeTitle = title || 'nvg-mini-shell';

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/nvg_mini_jobs`, {
      method: 'POST',
      headers: sbHeaders(supabaseKey),
      body: JSON.stringify({
        kind: 'shell',
        title: safeTitle,
        payload: { cmd },
        status: 'blocked_needs_jb',
        risk_flag: riskFlag,
        risk_reason: riskReason,
      }),
    });
  } catch {
    // Audit-only insert -- a failure here must never un-block the job below.
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/agent_dispatch`, {
      method: 'POST',
      headers: sbHeaders(supabaseKey),
      body: JSON.stringify({
        code: `MINI-BLOCKED-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: `Blocked mini shell job (unallowlisted): ${safeTitle}`.slice(0, 200),
        owner: 'runner',
        status: 'needs_jb',
        action_type: 'none',
        risk_tier: 'jb_only',
        executor: 'jb_manual',
        queued_by: 'agent',
        needs_jb_approval: true,
        source: 'AX-MINI-JOBS-NO-TIER-GATE-0813',
        result_summary: `${riskReason} | cmd: ${String(cmd).slice(0, 400)}`,
      }),
    });
  } catch {
    // Best-effort JB surfacing -- the nvg_mini_jobs row above already blocks execution
    // even if this insert fails.
  }
}
