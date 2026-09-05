/**
 * AXON Deploy QA — pure/testable logic for AX-SMALL-BUILDS-BUNDLE-0904 item (1).
 *
 * Scope (deliberately narrow, per the dispatch): after each push to `main` (the
 * event that also triggers AXON's own Vercel auto-deploy — same convention already
 * used by `.github/workflows/axon-telegram-webhook-on-deploy.yml`, which treats
 * push-to-main as "on deploy" rather than inventing a real Vercel webhook), build
 * a short markdown block comparing the deploy's outcome (CI checks at that SHA)
 * against its original plan (the associated PR's title/body, when one exists).
 *
 * No LLM call — same reasoning as axon-arceus-registry-check.mjs and
 * sync-ni-portal.yml's delete-guard: this is a mechanical "does the record match
 * the plan" comparison, not a judgment call, so it costs nothing and never
 * hallucinates a verdict (MONEY rule: nothing paid without JB).
 *
 * All network/filesystem/git I/O lives in scripts/axon-deploy-qa.mjs — this file
 * is pure functions only, so it can be unit tested with no Supabase/GitHub/fs
 * dependency (tests/axon-deploy-qa-core.test.mjs).
 */

const MAX_PLAN_CHARS = 1200;
const MAX_ENTRIES_KEPT = 40;
const ENTRY_DELIMITER = '\n---\n';

export function shortSha(sha) {
  return (sha || '').slice(0, 7);
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** The "original plan" for this deploy — the PR body/title, or the raw commit message. */
export function extractPlanText({ pr, commitMessage }) {
  if (pr?.body?.trim()) return truncate(pr.body.trim(), MAX_PLAN_CHARS);
  if (pr?.title?.trim()) return truncate(pr.title.trim(), MAX_PLAN_CHARS);
  if (commitMessage?.trim()) return truncate(commitMessage.trim(), MAX_PLAN_CHARS);
  return '(no PR body/title or commit message found — plan unknown)';
}

/**
 * Deterministic rollup of GitHub check-runs for the deploy SHA.
 * @param {Array<{name:string, status:string, conclusion:string|null}>} checkRuns
 */
export function summarizeChecks(checkRuns = []) {
  const lines = checkRuns.map(
    (c) => `- ${c.name}: ${c.conclusion || c.status || 'unknown'}`,
  );
  const total = checkRuns.length;
  const failed = checkRuns.filter((c) => c.conclusion && !['success', 'neutral', 'skipped'].includes(c.conclusion)).length;
  const pending = checkRuns.filter((c) => !c.conclusion).length;
  const passed = total - failed - pending;
  return { total, passed, failed, pending, lines };
}

/** Mechanical verdict — no model call, just "did every reported check come back green." */
export function verdictFromChecks(summary) {
  if (!summary || summary.total === 0) {
    return { verdict: 'UNKNOWN', reason: 'no check-runs were reported for this SHA at audit time' };
  }
  if (summary.pending > 0) {
    return { verdict: 'NEEDS REVIEW', reason: `${summary.pending} check(s) still pending when this QA note was written` };
  }
  if (summary.failed > 0) {
    return { verdict: 'NEEDS REVIEW', reason: `${summary.failed} of ${summary.total} check(s) did not pass` };
  }
  return { verdict: 'PASS', reason: `all ${summary.total} reported check(s) passed` };
}

/**
 * Render one deploy's QA entry as a self-contained markdown block.
 * @param {{sha:string, dateIso:string, commitMessage:string, pr:{number:number,title:string,html_url:string,body?:string}|null, checkRuns:Array, filesChanged:Array<string>}} input
 */
export function renderQaEntry({ sha, dateIso, commitMessage, pr, checkRuns = [], filesChanged = [] }) {
  const summary = summarizeChecks(checkRuns);
  const { verdict, reason } = verdictFromChecks(summary);
  const plan = extractPlanText({ pr, commitMessage });
  const prLine = pr
    ? `#${pr.number} — ${truncate(pr.title || '', 140)} (${pr.html_url})`
    : 'no associated PR found for this commit — deployed from a direct push';

  const lines = [
    `## Deploy ${shortSha(sha)} — ${dateIso}`,
    '',
    `**Commit:** \`${sha}\` — ${truncate((commitMessage || '').split('\n')[0], 140)}`,
    `**PR:** ${prLine}`,
    '',
    '### Original plan',
    plan,
    '',
    '### Checks at deploy time',
    summary.total ? summary.lines.join('\n') : '(no check-runs reported for this SHA)',
    '',
    filesChanged.length ? '### Files changed' : null,
    filesChanged.length ? filesChanged.slice(0, 30).map((f) => `- ${f}`).join('\n') : null,
    filesChanged.length > 30 ? `- …and ${filesChanged.length - 30} more` : null,
    '',
    `### Verdict: ${verdict}`,
    reason,
  ].filter((l) => l !== null);

  return lines.join('\n').trim();
}

/**
 * Prepend a new entry to the running QA.md, capped to the most recent
 * MAX_ENTRIES_KEPT entries so the file stays a readable, git-friendly log
 * instead of growing forever (same "kept token-lean on purpose" philosophy as
 * lib/axon-agent-boot.mjs).
 */
export function withNewEntry(existingContent, newEntryMarkdown) {
  const header = '# AXON Deploy QA\n\nOne entry per deploy to `main` — plan vs. outcome, newest first. Written by scripts/axon-deploy-qa.mjs (AX-SMALL-BUILDS-BUNDLE-0904).\n';
  const body = (existingContent || '').replace(header, '').trim();
  const priorEntries = body ? body.split(ENTRY_DELIMITER).filter(Boolean) : [];
  const allEntries = [newEntryMarkdown, ...priorEntries].slice(0, MAX_ENTRIES_KEPT);
  return `${header}\n${allEntries.join(ENTRY_DELIMITER)}\n`;
}

/** One-line Learnings row summarizing this deploy's QA check. */
export function buildLearningRow({ sha, verdict, reason, prNumber }) {
  return {
    learning:
      `[AXON-DEPLOY-QA] deploy ${shortSha(sha)}${prNumber ? ` (PR #${prNumber})` : ''}: ${verdict} — ${reason}`,
    source: 'axon-deploy-qa',
    date: new Date().toISOString(),
    category: 'axon-deploy-qa',
    project: 'AXON',
  };
}
