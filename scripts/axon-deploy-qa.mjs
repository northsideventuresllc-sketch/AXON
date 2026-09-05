#!/usr/bin/env node
/**
 * AXON Deploy QA — AX-SMALL-BUILDS-BUNDLE-0904 item (1).
 *
 * After each push to `main` (the same event that triggers AXON's own Vercel
 * auto-deploy — this repo has no dedicated Vercel deploy-hook workflow to hang
 * off of, so push-to-main is used as the "on deploy" trigger, exactly like the
 * existing `.github/workflows/axon-telegram-webhook-on-deploy.yml`), this:
 *   1. Looks up the PR associated with the deployed commit (the "plan") and the
 *      GitHub check-runs recorded for that SHA (the "outcome").
 *   2. Writes/updates `qa/QA.md` — one entry per deploy, newest first, "shows
 *      its work" (plan vs. checks vs. verdict).
 *   3. Writes one row to NI-Brain `Learnings`.
 *
 * Where QA.md lives (deliberate, see .github/workflows/axon-deploy-qa.yml):
 * this script only writes the file to the CURRENT working tree — it has no
 * git/GitHub-write logic of its own. The calling workflow commits it to a
 * dedicated `qa-log` branch (an orphan branch holding only this one file),
 * never to `main` directly, because `main` on this repo requires the
 * "council-review" status check (branch protection, confirmed via
 * `gh api repos/.../AXON/branches/main/protection` when this was built) and a
 * bot pushing straight to a protected branch is exactly the failure mode
 * documented in `.github/workflows/sync-ni-portal.yml`'s
 * HEALTH-BRANCH-PROTECTION-PR-FLOW note. A per-deploy bookkeeping log isn't
 * worth a PR-per-deploy cycle, so it lives on its own always-unprotected
 * branch instead — `git log origin/qa-log -- qa/QA.md` is the read path.
 *
 * OUT OF SCOPE (explicitly, per the dispatch): mirroring this into nv-vault.
 * That's a separate cross-repo-write concern (see sync-ni-portal.yml for what
 * that actually takes — clone, PR, lint-parity gate) and is not attempted here.
 *
 * Usage:
 *   node scripts/axon-deploy-qa.mjs [sha]     # defaults to GITHUB_SHA or HEAD
 *
 * Env:
 *   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — required for the Learnings write
 *   AXON_GITHUB_PAT / GITHUB_PAT / GH_PAT / GITHUB_TOKEN — used to read PR + check-run data
 *     (the workflow's default GITHUB_TOKEN is sufficient — same-repo reads only)
 *
 * SAFETY: reads axon_cron_jobs.enabled via cronGuardShouldSkip (JOB_ID below),
 * same fail-open convention as every other scheduled AXON job — no seed row
 * exists yet (no live-DB writes were made building this PR), so it fails open
 * (runs) until/unless a human adds a disabled row for this id. Rollback: add an
 * axon_cron_jobs row {id:'axon-deploy-qa', enabled:false}, or just remove/disable
 * the workflow trigger below.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import { getGithubPatFromEnv } from '../lib/github-pat.mjs';
import {
  renderQaEntry,
  withNewEntry,
  buildLearningRow,
  verdictFromChecks,
  summarizeChecks,
  shortSha,
} from '../lib/axon-deploy-qa-core.mjs';

const JOB_ID = 'axon-deploy-qa';
const OWNER = 'northsideventuresllc-sketch';
const REPO = 'AXON';
const QA_FILE_PATH = join('qa', 'QA.md');

function resolveSha() {
  const arg = process.argv[2];
  if (arg) return arg;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    throw new Error('Could not resolve a SHA (pass one as argv[2], or set GITHUB_SHA, or run inside a git checkout).');
  }
}

function localCommitMessage(sha) {
  try {
    return execSync(`git log -1 --format=%B ${sha}`).toString().trim();
  } catch {
    return '';
  }
}

async function ghJson(token, path) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!r.ok) {
    console.log(`GitHub API ${path}: HTTP ${r.status} (non-fatal, continuing with what we have)`);
    return null;
  }
  return r.json();
}

async function fetchDeployContext(sha, token) {
  const [prs, checkRuns, commit] = await Promise.all([
    ghJson(token, `/commits/${sha}/pulls`),
    ghJson(token, `/commits/${sha}/check-runs`),
    ghJson(token, `/commits/${sha}`),
  ]);
  const pr = Array.isArray(prs) && prs.length ? prs[0] : null;
  let filesChanged = (commit?.files || []).map((f) => f.filename);
  if (pr) {
    const prFiles = await ghJson(token, `/pulls/${pr.number}/files`);
    if (Array.isArray(prFiles)) filesChanged = prFiles.map((f) => f.filename);
  }
  return {
    pr,
    checkRuns: checkRuns?.check_runs || [],
    filesChanged,
  };
}

function writeQaLocally({ repoRoot, entryMarkdown }) {
  const dir = join(repoRoot, 'qa');
  const filePath = join(repoRoot, QA_FILE_PATH);
  try {
    mkdirSync(dir, { recursive: true });
    const existing = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
    const updated = withNewEntry(existing, entryMarkdown);
    writeFileSync(filePath, updated);
    return { skipped: false, filePath };
  } catch (err) {
    return { skipped: true, reason: `write failed: ${err.message}` };
  }
}

async function main() {
  const sha = resolveSha();
  console.log(`AXON Deploy QA — ${sha}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required');
  const sb = createSupabaseClient(key);

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;

  const token = getGithubPatFromEnv() || process.env.GITHUB_TOKEN || '';
  const { pr, checkRuns, filesChanged } = await fetchDeployContext(sha, token);
  const commitMessage = localCommitMessage(sha) || pr?.title || '';

  const entryMarkdown = renderQaEntry({
    sha,
    dateIso: new Date().toISOString().slice(0, 10),
    commitMessage,
    pr,
    checkRuns,
    filesChanged,
  });
  console.log(entryMarkdown);

  const repoRoot = process.env.AXON_REPO_DIR || process.cwd();
  const writeResult = writeQaLocally({ repoRoot, entryMarkdown });
  console.log(
    writeResult.skipped
      ? `qa/QA.md write: SKIPPED (${writeResult.reason})`
      : `qa/QA.md write: ok (${writeResult.filePath}) — committing this is the calling workflow's job, not this script's`,
  );

  const { verdict, reason } = verdictFromChecks(summarizeChecks(checkRuns));
  try {
    await sb.sbInsert('Learnings', buildLearningRow({ sha, verdict, reason, prNumber: pr?.number }));
    console.log('Learnings row: ok');
  } catch (err) {
    console.log(`Learnings row: FAILED (non-fatal, logged not faked): ${err.message}`);
  }

  console.log(`AXON Deploy QA complete for ${shortSha(sha)} — verdict: ${verdict}.`);
}

main().catch((err) => {
  console.error('AXON Deploy QA failed:', err);
  process.exitCode = 1;
});
