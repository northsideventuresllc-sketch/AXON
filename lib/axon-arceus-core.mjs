/**
 * AXON-ARCEUS v1 — read-only registry consistency checker.
 *
 * What this is: a linter/diff-checker for the AXON agent registry. It
 * compares axon_cron_jobs (the run-history table AXON's own cron jobs write
 * to) against nvg_agent_routines (the source-of-truth agent registry) and
 * reports rows that exist in one but not the other, plus places where a
 * routine's function_summary claims something ("PR not merged yet") that a
 * live GitHub check shows is no longer true.
 *
 * What this is NOT: it does not insert, update, or delete any row in
 * axon_cron_jobs or nvg_agent_routines. It does not grant, revoke, or touch
 * any agent's permissions, merge rights, or active flag. It only reads those
 * two tables plus GitHub's public PR-state API, and writes its findings to
 * agent_bus + Slack (and, only on a hard failure, Telegram). Every finding
 * in the report is a PROPOSAL for a human (or a later, separately-approved
 * tool) to act on — never applied automatically. That split is deliberate:
 * see Decision on the AXON-ARCEUS v1 PR.
 */

import { SUPABASE_URL } from './constants.mjs';

export const SELF_ROUTINE_ID = 'axon-arceus-registry-check';
export const SELF_AGENT_NAME = 'AXON-Registry-Check';
export const TIME_BUDGET_MS = 5 * 60 * 1000; // soft time-box for the GitHub PR-state lookups

// PR references embedded in registry text look like one of:
//   "PR #124", "PR northsideventuresllc-sketch/AXON#123", "pull/125"
const PR_REF_RE = /(?:([\w.-]+\/[\w.-]+)#(\d+))|(?:pull\/(\d+))/g;
const DEFAULT_REPO = 'northsideventuresllc-sketch/AXON';

function nowIso() {
  return new Date().toISOString();
}

export async function fetchAxonCronJobs(sbSelect) {
  return sbSelect(
    'axon_cron_jobs',
    'select=id,enabled,last_run_at,last_run_status,last_run_summary,next_run_at,warnings,updated_at&order=id.asc',
  );
}

export async function fetchAxonRoutines(sbSelect) {
  return sbSelect(
    'nvg_agent_routines',
    "platform=ilike.*axon*&select=agent_name,routine_id,active,wake_type,function_summary,platform,health_status,updated_at&order=routine_id.asc",
  );
}

/** Pull every repo#number PR reference out of a chunk of registry text. */
function extractPrRefs(text) {
  if (!text) return [];
  const out = [];
  let m;
  PR_REF_RE.lastIndex = 0;
  while ((m = PR_REF_RE.exec(text))) {
    const repo = m[1] || DEFAULT_REPO;
    const number = m[2] || m[3];
    if (number) out.push({ repo, number: Number(number) });
  }
  return out;
}

/**
 * Cross-check "PR open / not merged" style claims in registry text against
 * the PR's real, current state on GitHub. Best-effort: a lookup failure is
 * logged into the finding, never thrown — a dead GitHub token must not take
 * the whole check down.
 */
async function checkPrClaims(text, ghToken, deadlineMs, notes) {
  const refs = extractPrRefs(text);
  const findings = [];
  const seen = new Set();
  for (const ref of refs) {
    const key = `${ref.repo}#${ref.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (Date.now() > deadlineMs) {
      notes.push(`Time budget hit mid PR-state check — skipped remaining refs (${key} onward).`);
      break;
    }
    try {
      const r = await fetch(`https://api.github.com/repos/${ref.repo}/pulls/${ref.number}`, {
        headers: ghToken
          ? { Authorization: `token ${ghToken}`, 'User-Agent': 'axon-arceus-registry-check' }
          : { 'User-Agent': 'axon-arceus-registry-check' },
      });
      if (!r.ok) {
        notes.push(`GitHub PR lookup ${key}: HTTP ${r.status} — skipped, not treated as a finding.`);
        continue;
      }
      const pr = await r.json();
      const claimsOpen = /\bnot merged\b|\bopen\b|\bawaiting\b|\bpending\b/i.test(text);
      const isMerged = !!pr.merged;
      const isClosedUnmerged = pr.state === 'closed' && !pr.merged;
      if (claimsOpen && isMerged) {
        findings.push({
          type: 'stale_pr_claim',
          pr: key,
          detail: `Registry text says "${key}" is open/not merged, but GitHub shows it was merged.`,
          suggestion: `Update the function_summary for this routine — ${key} is merged now, so whatever it says is "not yet live" is probably live.`,
        });
      } else if (claimsOpen && isClosedUnmerged) {
        findings.push({
          type: 'stale_pr_claim',
          pr: key,
          detail: `Registry text says "${key}" is open/pending, but GitHub shows it was closed without merging.`,
          suggestion: `Check whether that work landed a different way, or the registry note needs updating to say it was dropped.`,
        });
      }
    } catch (err) {
      notes.push(`GitHub PR lookup ${key} failed: ${err.message} — skipped, not treated as a finding.`);
    }
  }
  return findings;
}

/**
 * Build the full diff between the two tables. Pure function over the two
 * fetched arrays plus an optional GitHub token for the PR-claim check —
 * makes this trivially testable without hitting Supabase or GitHub.
 */
export async function diffRegistry({ cronJobs, routines, ghToken, timeBudgetMs = TIME_BUDGET_MS }) {
  const deadlineMs = Date.now() + timeBudgetMs;
  const notes = [];

  const cronIds = new Set(cronJobs.map((j) => j.id));
  const routineIds = new Set(routines.map((r) => r.routine_id));

  const findings = [];

  // A — tracked in axon_cron_jobs (has real run history) but no registry row.
  for (const job of cronJobs) {
    if (!routineIds.has(job.id)) {
      findings.push({
        id: `missing_in_routines:${job.id}`,
        type: 'missing_in_routines',
        job_id: job.id,
        detail: `"${job.id}" has run history in axon_cron_jobs (last status: ${job.last_run_status || 'never run'}) but no matching row in nvg_agent_routines.`,
        suggestion: `Add a nvg_agent_routines row for "${job.id}" (active=false until reviewed), or confirm this id was retired and its axon_cron_jobs row should say so.`,
      });
    }
  }

  // B — registered as an AXON agent but axon_cron_jobs has never heard of it.
  for (const routine of routines) {
    if (!cronIds.has(routine.routine_id)) {
      findings.push({
        id: `missing_in_cron:${routine.routine_id}`,
        type: 'missing_in_cron',
        job_id: routine.routine_id,
        agent_name: routine.agent_name,
        detail: `"${routine.agent_name}" (${routine.routine_id}, wake_type=${routine.wake_type || 'unknown'}) is registered active=${routine.active} but has no row in axon_cron_jobs — no run history is ever recorded for it.`,
        suggestion: routine.wake_type === 'github_actions'
          ? `A GitHub Actions job normally self-registers a row on its first run (see registerCron() in scripts/axon-wisdom-loop.mjs) — worth checking the workflow actually calls that, or has ever fired.`
          : `wake_type is "${routine.wake_type || 'unknown'}", not github_actions, so a missing axon_cron_jobs row may be expected — flagging for a human to confirm, not treating as broken.`,
      });
    }
  }

  // C — matched rows: light active/enabled mismatch flag (info only).
  for (const job of cronJobs) {
    const routine = routines.find((r) => r.routine_id === job.id);
    if (!routine) continue;
    if (routine.active !== job.enabled) {
      findings.push({
        id: `active_enabled_mismatch:${job.id}`,
        type: 'active_enabled_mismatch',
        job_id: job.id,
        detail: `"${job.id}": nvg_agent_routines.active=${routine.active} but axon_cron_jobs.enabled=${job.enabled}.`,
        suggestion: `Not necessarily a bug — several jobs are deliberately off_on_purpose. Worth a glance to confirm this one is intentional, not a slip.`,
      });
    }
  }

  // D — stale PR claims inside function_summary / last_run_summary.
  for (const job of cronJobs) {
    const routine = routines.find((r) => r.routine_id === job.id);
    const text = [routine?.function_summary, job.last_run_summary].filter(Boolean).join('\n');
    if (!text) continue;
    if (Date.now() > deadlineMs) {
      notes.push('Time budget hit before all PR-claim checks ran — this job needs to resume within ~12h to finish the rest.');
      break;
    }
    const prFindings = await checkPrClaims(text, ghToken, deadlineMs, notes);
    for (const f of prFindings) {
      findings.push({ id: `stale_pr_claim:${job.id}:${f.pr}`, job_id: job.id, ...f });
    }
  }

  return { findings, notes, generatedAt: nowIso() };
}

/** Build a plain-English, ADHD-friendly report from a diff result + prior-run state. */
export function buildReport({ diff, previousFindingIds }) {
  const prevSet = new Set(previousFindingIds || []);
  const newOnes = diff.findings.filter((f) => !prevSet.has(f.id));
  const stillOpen = diff.findings.filter((f) => prevSet.has(f.id));

  const lines = [];
  lines.push(`🔎 AXON-ARCEUS registry check — ${diff.generatedAt.slice(0, 10)}`);
  lines.push('');
  lines.push('This is v1: read-only, propose-only. It never changes any agent\'s permissions or turns anything on — it just spots mismatches and suggests a fix for a human to make.');
  lines.push('');

  if (diff.findings.length === 0) {
    lines.push('✅ All clear — axon_cron_jobs and nvg_agent_routines line up, no stale PR claims found.');
  } else {
    if (newOnes.length) {
      lines.push(`🆕 New since last check (${newOnes.length}):`);
      for (const f of newOnes) {
        lines.push(`  • ${f.detail}`);
        lines.push(`    → suggested fix: ${f.suggestion}`);
      }
      lines.push('');
    }
    if (stillOpen.length) {
      lines.push(`📌 Still open, already flagged before (${stillOpen.length}) — not repeating the full detail, just the id:`);
      for (const f of stillOpen) lines.push(`  • ${f.job_id || f.id}`);
      lines.push('');
    }
  }

  if (diff.notes.length) {
    lines.push('Notes from this run:');
    for (const n of diff.notes) lines.push(`  • ${n}`);
  }

  return { text: lines.join('\n'), newCount: newOnes.length, stillOpenCount: stillOpen.length };
}

/** Self-register this checker's own run in axon_cron_jobs — same pattern as scripts/axon-wisdom-loop.mjs registerCron(). */
export async function registerSelfRun(serviceKey, { status, summary, findingIds }) {
  if (!serviceKey) return false;
  const now = new Date();
  const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/axon_cron_jobs?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: SELF_ROUTINE_ID,
        enabled: true,
        last_run_at: now.toISOString(),
        last_run_status: status,
        last_run_summary: summary.slice(0, 500),
        next_run_at: next.toISOString(),
        warnings: findingIds,
      }),
    });
    return r.ok;
  } catch (err) {
    console.error(`axon-arceus: self-register failed — ${err.message}`);
    return false;
  }
}

export async function postToAgentBus(sbInsert, { subject, body, needsAnswer = false }) {
  return sbInsert('agent_bus', {
    from_agent: SELF_AGENT_NAME,
    to_agent: 'ALL',
    subject,
    body,
    needs_answer: needsAnswer,
    status: 'open',
  });
}

export async function postSlack(text) {
  const r = await fetch('https://kxijunwgbrlfzvgkhklo.supabase.co/functions/v1/slack-post', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer sb_publishable_-JPXXSn9eyX9BxdvIzTulw_QkHPIERR',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel: 'C0BQMTYMNRH', text }),
  });
  return { ok: r.ok, status: r.status };
}

/** Urgent-only channel — a genuinely broken run, never routine findings. */
export async function alertTelegramUrgent(sbSelect, text) {
  async function secret(key) {
    if (process.env[key]) return process.env[key];
    const rows = await sbSelect('ni_platform_secrets', `key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    return rows?.[0]?.value || null;
  }
  const token = await secret('TELEGRAM_BOT_TOKEN');
  const chatId = await secret('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return { ok: false, reason: 'missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return { ok: r.ok, status: r.status };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
