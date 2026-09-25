#!/usr/bin/env node
/**
 * AXON-LIVE-VERIFY-0925 — proves verifyMergedToMain/verifyFileExistsInRepo
 * actually answer from git, not from an assumption. Builds a real temp git
 * repo per test (branch commit not yet merged, then merged; a file committed
 * vs. a file present on disk but never committed) and reproduces the exact
 * two failure shapes this helper exists to catch:
 *   - Learning #9871: a commit wrongly reported "not yet merged to main".
 *   - Learning #9818: a file wrongly reported "built" when never committed.
 *
 * Run: node --test tests/axon-live-verify.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyMergedToMain, verifyFileExistsInRepo } from '../lib/axon-live-verify.mjs';

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
  return r.stdout.trim();
}

function makeTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'axon-live-verify-test-'));
  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  writeFileSync(join(dir, 'README.md'), 'seed\n');
  git(dir, ['add', 'README.md']);
  git(dir, ['commit', '--quiet', '-m', 'seed']);
  return dir;
}

test('verifyMergedToMain: reports merged=true for a commit that is an ancestor of main', () => {
  const dir = makeTempRepo();
  try {
    writeFileSync(join(dir, 'feature.txt'), 'feature\n');
    git(dir, ['add', 'feature.txt']);
    git(dir, ['commit', '--quiet', '-m', 'add feature']);
    const sha = git(dir, ['rev-parse', 'HEAD']);

    const result = verifyMergedToMain(sha, { cwd: dir });
    assert.equal(result.verified, true);
    assert.equal(result.merged, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyMergedToMain (Learning #9871 shape): a commit on an unmerged branch is honestly reported merged=false, never a false "merged" claim', () => {
  const dir = makeTempRepo();
  try {
    git(dir, ['checkout', '--quiet', '-b', 'feature-branch']);
    writeFileSync(join(dir, 'unmerged.txt'), 'not merged yet\n');
    git(dir, ['add', 'unmerged.txt']);
    git(dir, ['commit', '--quiet', '-m', 'unmerged work']);
    const unmergedSha = git(dir, ['rev-parse', 'HEAD']);
    git(dir, ['checkout', '--quiet', 'main']);

    const result = verifyMergedToMain(unmergedSha, { cwd: dir });
    assert.equal(result.verified, true);
    assert.equal(result.merged, false);

    // Prove the check actually flips once it really is merged — not a
    // hardcoded false. Hand-revert style proof (Learning #9398 convention).
    git(dir, ['merge', '--quiet', '--no-ff', '-m', 'merge feature-branch', 'feature-branch']);
    const afterMerge = verifyMergedToMain(unmergedSha, { cwd: dir });
    assert.equal(afterMerge.verified, true);
    assert.equal(afterMerge.merged, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyMergedToMain: unresolvable sha is reported unverified, not merged=false', () => {
  const dir = makeTempRepo();
  try {
    const result = verifyMergedToMain('0000000000000000000000000000000000000000', { cwd: dir });
    assert.equal(result.verified, false);
    assert.equal(result.merged, false);
    assert.ok(result.reason);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyFileExistsInRepo: a committed file is verified present', () => {
  const dir = makeTempRepo();
  try {
    const result = verifyFileExistsInRepo('README.md', { cwd: dir });
    assert.equal(result.verified, true);
    assert.equal(result.exists, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyFileExistsInRepo (Learning #9818 shape): a file present on disk but never committed is reported exists=false, never a false "built" claim', () => {
  const dir = makeTempRepo();
  try {
    // Same shape as the fabricated Cross-App-Memory claim: a real file on
    // disk that was never `git add`/`git commit`-ed.
    writeFileSync(join(dir, 'never-committed.mjs'), 'export const orphan = true;\n');

    const result = verifyFileExistsInRepo('never-committed.mjs', { cwd: dir });
    assert.equal(result.verified, true);
    assert.equal(result.exists, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyFileExistsInRepo: reports unverified (not exists=false) when cwd is not a git repo at all', () => {
  const dir = mkdtempSync(join(tmpdir(), 'axon-live-verify-non-repo-'));
  try {
    const result = verifyFileExistsInRepo('anything.mjs', { cwd: dir });
    assert.equal(result.verified, false);
    assert.ok(result.reason);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
