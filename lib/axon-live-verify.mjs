/**
 * AXON LIVE VERIFY — lib/axon-live-verify.mjs
 *
 * Shared helper for any report-writing path (SENSEI, PULSE, the nightly
 * executive agent, etc.) that is about to assert a build/merge/deploy fact.
 * Two fabrication patterns already shipped false claims into Learnings:
 *
 *   - Learning #9871: a "commit X is NOT yet merged to main" claim (2026-09-23
 *     Daily AXON Report, Section 2 competitor-analysis) was wrong because the
 *     reporting pass checked `git log`/`git branch` instead of asking git the
 *     actual ancestor question.
 *   - Learning #9818: a "module built and tested at lib/axon-cross-app-memory.mjs"
 *     claim (Learning #9505 / Decision #1971) was false — the file existed on
 *     disk in an unrelated, non-git folder and was never committed to the real
 *     AXON repo at all.
 *
 * Both are the same root cause: a report stated a fact about repo state
 * without asking git. verifyMergedToMain / verifyFileExistsInRepo ask git
 * directly and return a structured, honest result instead of an assumption —
 * callers should never assert "merged" or "built" without checking `verified`.
 */
import { spawnSync } from 'node:child_process';

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

/**
 * Is `sha` an ancestor of `branch` (default main)? The only correct way to
 * answer "is X merged to main" (Learning #9871) — never `git log`/`git branch`
 * text matching.
 *
 * Returns { verified, merged, reason? }. `verified: false` means the question
 * itself could not be answered (bad sha, repo unreachable) — callers must not
 * report a merge status when `verified` is false.
 */
export function verifyMergedToMain(sha, { cwd = process.cwd(), branch = 'main' } = {}) {
  if (!sha || typeof sha !== 'string') {
    return { verified: false, merged: false, reason: 'no sha provided' };
  }
  const shaExists = git(['cat-file', '-e', `${sha}^{commit}`], cwd);
  if (shaExists.status !== 0) {
    return { verified: false, merged: false, reason: `sha ${sha} not found in repo at ${cwd}` };
  }
  const branchExists = git(['cat-file', '-e', `${branch}^{commit}`], cwd);
  if (branchExists.status !== 0) {
    return { verified: false, merged: false, reason: `branch ${branch} not found in repo at ${cwd}` };
  }
  const result = git(['merge-base', '--is-ancestor', sha, branch], cwd);
  if (result.status === 0) return { verified: true, merged: true, sha, branch };
  if (result.status === 1) return { verified: true, merged: false, sha, branch };
  return {
    verified: false,
    merged: false,
    reason: (result.stderr || '').trim() || `git merge-base exited ${result.status}`,
  };
}

/**
 * Is `path` actually tracked by git at `ref` (default HEAD) — not just present
 * on disk? The check that would have caught Learning #9818 (a file sitting in
 * a folder that was never a git repo, cited as "built and tested" in AXON).
 *
 * Returns { verified, exists, reason? }.
 */
export function verifyFileExistsInRepo(path, { cwd = process.cwd(), ref = 'HEAD' } = {}) {
  if (!path || typeof path !== 'string') {
    return { verified: false, exists: false, reason: 'no path provided' };
  }
  const result = git(['ls-tree', '-r', '--name-only', ref, '--', path], cwd);
  if (result.status !== 0) {
    return {
      verified: false,
      exists: false,
      reason: (result.stderr || '').trim() || `git ls-tree exited ${result.status}`,
    };
  }
  const tracked = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return { verified: true, exists: tracked.includes(path), path, ref };
}
