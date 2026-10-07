#!/usr/bin/env node
/**
 * AXON UI Copy (IU2-AXON-UICOPY-1006) — proves string extraction stays
 * prose-only (skips code/classNames/URLs), the model review never fabricates
 * issues when the cascade is unreachable, and the run writes a lab-log row
 * plus a conditional Executive handoff.
 *
 * Offline: no network, no env secrets. Run: node --test tests/axon-ui-copy-review.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isScannableFile,
  listUiCopyFiles,
  extractUserFacingStrings,
  buildReviewPrompt,
  reviewFile,
  buildHandoffBody,
  runUiCopyReview,
  UI_COPY_LANE_ID,
} from '../lib/axon-ui-copy-review.mjs';
// Review-fix additions are read off the namespace so the new tests also load (and fail
// on behavior, not on a link error) against the pre-fix module.
import * as ui from '../lib/axon-ui-copy-review.mjs';

function stubGenerate(text, source = 'openrouter') {
  const calls = [];
  const fn = async (supabaseKey, opts) => {
    calls.push({ supabaseKey, opts });
    return { text, source, model: 'test-model' };
  };
  fn.calls = calls;
  return fn;
}

function failingGenerate(message = 'every tier in the chain failed') {
  return async () => {
    throw new Error(message);
  };
}

function fakeSb() {
  const inserted = [];
  const sbInsert = async (table, row) => {
    inserted.push({ table, row });
    if (table === 'axon_research_runs') return { id: `run-${inserted.length}`, ...row };
    return { id: `row-${inserted.length}`, ...row };
  };
  return { sbInsert, inserted };
}

// ---------------------------------------------------------------------------
// isScannableFile / listUiCopyFiles
// ---------------------------------------------------------------------------

test('isScannableFile keeps .tsx/.jsx, skips tests and other extensions', () => {
  assert.equal(isScannableFile('app/page.tsx'), true);
  assert.equal(isScannableFile('components/Button.jsx'), true);
  assert.equal(isScannableFile('components/Button.test.tsx'), false);
  assert.equal(isScannableFile('components/Button.spec.jsx'), false);
  assert.equal(isScannableFile('lib/helper.mjs'), false);
});

test('listUiCopyFiles walks injected dirs, skips node_modules, missing dirs are fine', () => {
  const tree = {
    app: [
      { name: 'page.tsx', isDirectory: () => false, isFile: () => true },
      { name: 'node_modules', isDirectory: () => true, isFile: () => false },
      { name: 'sub', isDirectory: () => true, isFile: () => false },
    ],
    'app/sub': [{ name: 'inner.tsx', isDirectory: () => false, isFile: () => true }],
    'app/node_modules': [{ name: 'ignored.tsx', isDirectory: () => false, isFile: () => true }],
  };
  const listDir = (absPath) => {
    const rel = absPath.split('/repo/')[1];
    if (!tree[rel]) throw new Error('ENOENT');
    return tree[rel];
  };
  const files = listUiCopyFiles('/repo', { dirs: ['app'], listDir });
  assert.deepEqual(files, ['app/page.tsx', 'app/sub/inner.tsx']);
});

test('listUiCopyFiles silently skips a dir that does not exist (e.g. no components/ in this repo)', () => {
  const listDir = () => {
    throw new Error('ENOENT');
  };
  assert.deepEqual(listUiCopyFiles('/repo', { dirs: ['nope'], listDir }), []);
});

// ---------------------------------------------------------------------------
// extractUserFacingStrings
// ---------------------------------------------------------------------------

test('extractUserFacingStrings pulls JSX text and copy attributes, skips code-like tokens', () => {
  const source = `
    export function Card() {
      return (
        <div className="flex gap-2" data-testid="card-root">
          <h1>Welcome back to AXON</h1>
          <input placeholder="Search agents..." aria-label="Agent search" />
          <img src="/logo.png" alt="AXON logo" />
          <a href="https://example.com">https://example.com</a>
          <span>{count}</span>
          <p>{\`Loaded \${count} items\`}</p>
        </div>
      );
    }
  `;
  const found = extractUserFacingStrings(source);
  const texts = found.map((f) => f.text);

  assert.ok(texts.includes('Welcome back to AXON'));
  assert.ok(found.some((f) => f.kind === 'attr:placeholder' && f.text === 'Search agents...'));
  assert.ok(found.some((f) => f.kind === 'attr:aria-label' && f.text === 'Agent search'));
  assert.ok(found.some((f) => f.kind === 'attr:alt' && f.text === 'AXON logo'));

  // Never flag className, data-testid, bare URLs, or template interpolation.
  assert.ok(!texts.some((t) => t.includes('flex gap-2')));
  assert.ok(!texts.includes('https://example.com'));
  assert.ok(!texts.some((t) => t.includes('${')));
});

test('extractUserFacingStrings dedupes identical text+kind pairs', () => {
  const source = `<p>Save changes</p><p>Save changes</p>`;
  const found = extractUserFacingStrings(source);
  assert.equal(found.filter((f) => f.text === 'Save changes').length, 1);
});

test('extractUserFacingStrings returns [] for a file with no prose (pure logic/API route)', () => {
  const source = `export async function GET() { return Response.json({ ok: true }); }`;
  assert.deepEqual(extractUserFacingStrings(source), []);
});

// ---------------------------------------------------------------------------
// buildReviewPrompt
// ---------------------------------------------------------------------------

test('buildReviewPrompt names the file and lists every string', () => {
  const prompt = buildReviewPrompt('app/page.tsx', [{ text: 'Welcome back', kind: 'jsx-text' }]);
  assert.match(prompt, /app\/page\.tsx/);
  assert.match(prompt, /Welcome back/);
});

// ---------------------------------------------------------------------------
// reviewFile — never fabricates when the cascade is unreachable
// ---------------------------------------------------------------------------

test('reviewFile skips the model call entirely when there are no strings', async () => {
  const gen = stubGenerate('{"issues":[]}');
  const result = await reviewFile({ filePath: 'app/empty.tsx', strings: [], generate: gen });
  assert.equal(result.skipped, true);
  assert.equal(gen.calls.length, 0);
});

test('reviewFile returns real issues from a valid model response', async () => {
  const gen = stubGenerate(
    JSON.stringify({
      issues: [
        { original: 'Your going to love this', problem: "wrong 'your' — should be 'you're'", suggested_fix: "You're going to love this" },
      ],
    })
  );
  const result = await reviewFile({
    filePath: 'app/page.tsx',
    strings: [{ text: 'Your going to love this', kind: 'jsx-text' }],
    generate: gen,
  });
  assert.equal(result.skipped, false);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].suggested_fix, "You're going to love this");
});

test('reviewFile returns an honest empty result (never a fabricated issue) when the cascade is unreachable', async () => {
  const gen = failingGenerate();
  const result = await reviewFile({
    filePath: 'app/page.tsx',
    strings: [{ text: 'Some real copy', kind: 'jsx-text' }],
    generate: gen,
  });
  assert.equal(result.skipped, true);
  assert.deepEqual(result.issues, []);
  assert.match(result.reason, /no AI cascade reachable/);
});

// ---------------------------------------------------------------------------
// buildHandoffBody
// ---------------------------------------------------------------------------

test('buildHandoffBody only includes files that actually have issues', () => {
  const body = buildHandoffBody(
    [
      { filePath: 'app/a.tsx', issues: [{ original: 'x', problem: 'y', suggested_fix: 'z' }] },
      { filePath: 'app/b.tsx', issues: [] },
    ],
    null
  );
  assert.equal(body.files_with_issues, 1);
  assert.deepEqual(body.files.map((f) => f.file), ['app/a.tsx']);
});

// ---------------------------------------------------------------------------
// runUiCopyReview — end to end with fake fs/sb/generate seams
// ---------------------------------------------------------------------------

function fakeFiles() {
  return {
    'app/a.tsx': '<p>Your going to love this feature</p>',
    'app/b.tsx': '<p>Everything looks great</p>',
  };
}

test('runUiCopyReview writes a lab-log run row and hands off only when issues exist', async () => {
  const files = fakeFiles();
  const sb = fakeSb();
  const gen = async (key, opts) => {
    if (opts.user.includes('app/a.tsx')) {
      return {
        text: JSON.stringify({ issues: [{ original: 'Your going to love this feature', problem: "should be 'you're'", suggested_fix: "You're going to love this feature" }] }),
        source: 'openrouter',
        model: 'test',
      };
    }
    return { text: JSON.stringify({ issues: [] }), source: 'openrouter', model: 'test' };
  };

  const result = await runUiCopyReview({
    sbInsert: sb.sbInsert,
    supabaseKey: 'test-key',
    repoRoot: '/repo',
    generate: gen,
    listFiles: () => Object.keys(files),
    readFile: (p) => files[p.replace('/repo/', '')],
  });

  assert.equal(result.filesScanned, 2);
  assert.equal(result.filesWithIssues, 1);
  assert.equal(result.totalIssues, 1);

  const runRow = sb.inserted.find((r) => r.table === 'axon_research_runs');
  assert.ok(runRow, 'expected a lab-log run row');
  assert.equal(runRow.row.lane, UI_COPY_LANE_ID);

  const handoff = sb.inserted.find((r) => r.table === 'agent_bus');
  assert.ok(handoff, 'expected an Executive handoff when issues were found');
  assert.equal(handoff.row.from_agent, 'AXON UI Copy');
  assert.equal(handoff.row.to_agent, 'AXON Executive');
  assert.equal(handoff.row.body.files_with_issues, 1);
});

test('runUiCopyReview skips the handoff when every file is clean', async () => {
  const sb = fakeSb();
  const gen = stubGenerate(JSON.stringify({ issues: [] }));

  await runUiCopyReview({
    sbInsert: sb.sbInsert,
    supabaseKey: 'test-key',
    repoRoot: '/repo',
    generate: gen,
    listFiles: () => ['app/clean.tsx'],
    readFile: () => '<p>Everything looks great</p>',
  });

  assert.ok(!sb.inserted.some((r) => r.table === 'agent_bus'));
});

test('runUiCopyReview respects the time budget and reports what it stopped before', async () => {
  const sb = fakeSb();
  const gen = stubGenerate(JSON.stringify({ issues: [] }));
  let calls = 0;
  const budgetCheck = () => {
    calls += 1;
    return calls > 1; // let the first file through, stop before the second
  };

  const result = await runUiCopyReview({
    sbInsert: sb.sbInsert,
    supabaseKey: 'test-key',
    repoRoot: '/repo',
    generate: gen,
    budgetCheck,
    rotationWindows: 1, // keep list order fixed: this test is about the budget, not rotation
    listFiles: () => ['app/a.tsx', 'app/b.tsx'],
    readFile: () => '<p>Some real copy here</p>',
  });

  assert.equal(result.filesScanned, 1);
  assert.equal(result.stoppedEarly, 'app/b.tsx');
});

test('runUiCopyReview in dry-run mode never writes to the database', async () => {
  const sb = fakeSb();
  const gen = stubGenerate(
    JSON.stringify({ issues: [{ original: 'x', problem: 'y', suggested_fix: 'z' }] })
  );

  await runUiCopyReview({
    sbInsert: sb.sbInsert,
    supabaseKey: 'test-key',
    repoRoot: '/repo',
    generate: gen,
    dryRun: true,
    listFiles: () => ['app/a.tsx'],
    readFile: () => '<p>Some real copy here</p>',
  });

  assert.equal(sb.inserted.length, 0);
  assert.equal(gen.calls.length, 0, 'dry run must not reach the model either');
});

test('runUiCopyReview never calls the model for files with no extractable copy', async () => {
  const sb = fakeSb();
  const gen = stubGenerate(JSON.stringify({ issues: [] }));

  await runUiCopyReview({
    sbInsert: sb.sbInsert,
    supabaseKey: 'test-key',
    repoRoot: '/repo',
    generate: gen,
    listFiles: () => ['app/api-route.tsx'],
    readFile: () => `export async function GET() { return Response.json({ ok: true }); }`,
  });

  assert.equal(gen.calls.length, 0);
});

// ===========================================================================
// COUNCIL GATE fix round for AXON PR 301 (findings F1-F8). Each REGRESSION
// test below fails on the pre-fix code and passes after the fix.
// ===========================================================================

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'axon-ui-copy-review.mjs');

function copyTree(n) {
  const files = {};
  for (let i = 1; i <= n; i += 1) files[`app/f${String(i).padStart(2, '0')}.tsx`] = `<p>Real screen copy number ${i}</p>`;
  return files;
}

// rotationWindows:1 pins list order; tests about rotation pass their own value.
function runWith(files, extra = {}) {
  const sb = fakeSb();
  const call = runUiCopyReview({
    sbInsert: sb.sbInsert,
    supabaseKey: 'test-key',
    repoRoot: '/repo',
    listFiles: () => Object.keys(files),
    readFile: (p) => files[p.replace('/repo/', '')],
    rotationWindows: 1,
    ...extra,
  });
  return { sb, call };
}

const labRows = (sb) => sb.inserted.filter((r) => r.table === 'axon_research_runs');
const OK_EMPTY = { text: '{"issues":[]}', source: 'openrouter', model: 'test-model' };

// Replays one behavior per model call: 'ok' | 'down' | 'garbage'.
function scripted(steps) {
  let n = 0;
  const fn = async () => {
    const step = steps[n++] ?? 'ok';
    if (step === 'down') throw new Error('every tier in the chain failed');
    if (step === 'garbage') return { text: 'sorry, no json here', source: 'openrouter', model: 'test-model' };
    return OK_EMPTY;
  };
  fn.count = () => n;
  return fn;
}

function capture() {
  const out = [];
  const err = [];
  return { out, err, log: (m) => out.push(String(m)), logError: (m) => err.push(String(m)) };
}

// Every seam that could touch the network, a key or a model throws if called.
function forbiddenDeps(extra = {}) {
  const boom = (name) => () => {
    throw new Error(`${name} must not be called`);
  };
  return {
    createSupabaseClient: boom('createSupabaseClient'),
    cronGuardShouldSkip: boom('cronGuardShouldSkip'),
    loadConfig: boom('loadConfig'),
    generate: boom('generate'),
    listFiles: () => ['app/a.tsx'],
    readFile: () => '<p>Some real copy here</p>',
    ...extra,
  };
}

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'ui-copy-'));
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'app', 'page.tsx'), '<p>Welcome back to AXON</p>');
  return dir;
}

// No keys and no proxy variables: the child cannot reach a database or a model.
function runScript(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    env: { PATH: process.env.PATH },
    encoding: 'utf8',
    timeout: 20_000,
  });
}

// ---- F1: dry run is extraction only -------------------------------------

test('REGRESSION F1: a dry run never calls the model and never writes, even when it would find issues', async () => {
  const gen = stubGenerate(JSON.stringify({ issues: [{ original: 'x', problem: 'y', suggested_fix: 'z' }] }));
  const { sb, call } = runWith(copyTree(5), { generate: gen, dryRun: true });
  const run = await call;
  assert.equal(gen.calls.length, 0, 'model must not be called in a dry run');
  assert.equal(sb.inserted.length, 0);
  assert.equal(run.status, 'dry_run');
  assert.equal(run.filesWithCopy, 5);
  assert.equal(run.filesReviewed, 0);
  assert.match(run.summary, /dry run.*No model was called/);
});

test('REGRESSION F1: reviewFile in dryRun mode never calls generate', async () => {
  const gen = stubGenerate('{"issues":[]}');
  const result = await reviewFile({ filePath: 'app/a.tsx', strings: [{ text: 'Some real copy', kind: 'jsx-text' }], generate: gen, dryRun: true });
  assert.equal(gen.calls.length, 0);
  assert.equal(result.skipped, true);
});

test('REGRESSION F1: --dry-run alone is honored: no key, no database, no model, exit 0', async () => {
  const c = capture();
  const code = await ui.runCli({ argv: ['--dry-run'], env: {}, deps: forbiddenDeps(), log: c.log, logError: c.logError });
  assert.equal(code, 0);
  assert.deepEqual(c.err, []);
  assert.match(c.out.join('\n'), /dry run/i);
});

test('F1: AXON_DRY_RUN=1 is honored before any database read, even with a key present', async () => {
  const c = capture();
  const code = await ui.runCli({ argv: [], env: { AXON_DRY_RUN: '1', SUPABASE_SERVICE_KEY: 'k' }, deps: forbiddenDeps(), log: c.log, logError: c.logError });
  assert.equal(code, 0);
  assert.match(c.out.join('\n'), /No model was called/);
});

test('REGRESSION F1: a mistyped flag is refused, it never falls through to a live run', async () => {
  assert.deepEqual(ui.parseCliArgs(['--dryrun']).unknown, ['--dryrun']);
  assert.equal(ui.parseCliArgs(['--dry-run']).dryRun, true);
  const c = capture();
  const code = await ui.runCli({ argv: ['--dryrun'], env: { SUPABASE_SERVICE_KEY: 'k' }, deps: forbiddenDeps(), log: c.log, logError: c.logError });
  assert.equal(code, 2);
  assert.equal(c.err.length, 1);
  assert.match(c.err[0], /--dry-run/);
});

// ---- F2: a real run without the key fails with one plain sentence -------

test('REGRESSION F2: a real run without the database key says one plain sentence and exits 1 before any call', async () => {
  const c = capture();
  const code = await ui.runCli({ argv: [], env: {}, deps: forbiddenDeps(), log: c.log, logError: c.logError });
  assert.equal(code, 1);
  assert.equal(c.err.length, 1);
  assert.match(c.err[0], /database key is not set/);
  assert.doesNotMatch(c.err[0], /TypeError|\n\s+at /);
});

// ---- F3: honest run status ---------------------------------------------

test('REGRESSION F3: a dead chain is reported as skipped, never as a clean success', async () => {
  const gen = scripted(['down', 'down']);
  const { sb, call } = runWith(copyTree(2), { generate: gen });
  const run = await call;
  assert.equal(run.filesReviewed, 0);
  assert.equal(run.status, 'skipped');
  assert.match(run.summary, /SKIPPED: no file was reviewed/);
  assert.doesNotMatch(run.summary, /0 with issues/);
  assert.equal(labRows(sb).length, 1);
  assert.equal(labRows(sb)[0].row.status, 'skipped');
  assert.match(labRows(sb)[0].row.error_message, /Every review attempt failed/);
});

test('F3: no file with on-screen text is skipped (and never reaches the model); no files at all is failed', async () => {
  const gen = scripted([]);
  const none = runWith({ 'app/api.tsx': 'export const a = 1;' }, { generate: gen });
  const noCopy = await none.call;
  assert.equal(noCopy.status, 'skipped');
  assert.equal(gen.count(), 0);
  assert.equal(labRows(none.sb)[0].row.status, 'skipped');

  const empty = runWith({}, { generate: gen });
  const zero = await empty.call;
  assert.equal(zero.status, 'failed');
  assert.equal(labRows(empty.sb)[0].row.status, 'failed');
  assert.match(zero.summary, /FAILED/);
});

test('F3: a partly reviewed run is completed and says how many reviews failed', async () => {
  const { sb, call } = runWith(copyTree(2), { generate: scripted(['ok', 'down']) });
  const run = await call;
  assert.equal(run.status, 'completed');
  assert.equal(run.filesReviewed, 1);
  assert.match(run.summary, /reviewed 1 of 2 file\(s\) with on-screen text/);
  assert.match(run.summary, /1 review\(s\) failed/);
  assert.equal(labRows(sb)[0].row.meta.files_reviewed, 1);
});

// ---- F4: circuit breaker -------------------------------------------------

test('REGRESSION F4: the breaker stops after 3 failed model calls in a row and writes one skipped row', async () => {
  const gen = scripted(Array(10).fill('down'));
  const { sb, call } = runWith(copyTree(10), { generate: gen });
  const run = await call;
  assert.equal(gen.count(), 3, 'only 3 router calls, not one per file');
  assert.equal(run.breakerTripped, true);
  assert.equal(labRows(sb).length, 1);
  assert.equal(labRows(sb)[0].row.status, 'skipped');
  assert.equal(labRows(sb)[0].row.meta.not_reached, 7);
  assert.match(labRows(sb)[0].row.error_message, /did not answer 3 times in a row/);
  assert.ok(!sb.inserted.some((r) => r.table === 'agent_bus'));
});

test('F4: a good reply, or a reply that arrived but was unreadable, resets the failure count', async () => {
  const gen = scripted(['down', 'down', 'ok', 'down', 'down', 'garbage', 'down', 'down']);
  const { call } = runWith(copyTree(8), { generate: gen });
  const run = await call;
  assert.equal(run.breakerTripped, false);
  assert.equal(gen.count(), 8);
  assert.equal(run.status, 'completed');
});

// ---- F5: failures never go to JB's chat ----------------------------------

test('REGRESSION F5: neither file can message JB directly', () => {
  for (const rel of ['scripts/axon-ui-copy-review.mjs', 'lib/axon-ui-copy-review.mjs']) {
    assert.doesNotMatch(readFileSync(join(ROOT, rel), 'utf8'), /telegramAlert|sendToJb|jb-route/, `${rel} must not message JB`);
  }
});

test('F5: an unexpected failure is recorded as a failed run-log row and exits 1 with a plain line', async () => {
  const sb = fakeSb();
  const c = capture();
  const code = await ui.runCli({
    argv: [],
    env: { SUPABASE_SERVICE_KEY: 'k' },
    deps: {
      createSupabaseClient: () => ({ sbSelect: async () => [], sbInsert: sb.sbInsert }),
      cronGuardShouldSkip: async () => {
        throw new Error('database unreachable');
      },
    },
    log: c.log,
    logError: c.logError,
  });
  assert.equal(code, 1);
  assert.equal(labRows(sb)[0].row.status, 'failed');
  assert.equal(c.err.length, 1);
  assert.doesNotMatch(c.err.join(' '), /check app\/components/);
});

test('F5/F3: zero files on a real run writes a failed run-log row and exits 1', async () => {
  const sb = fakeSb();
  const c = capture();
  const code = await ui.runCli({
    argv: [],
    env: { SUPABASE_SERVICE_KEY: 'k' },
    deps: {
      createSupabaseClient: () => ({ sbSelect: async () => [], sbInsert: sb.sbInsert }),
      cronGuardShouldSkip: async () => false,
      loadConfig: async () => ({ dryRun: false, supabaseKey: 'k' }),
      generate: scripted([]),
      listFiles: () => [],
    },
    log: c.log,
    logError: c.logError,
  });
  assert.equal(code, 1);
  assert.equal(labRows(sb)[0].row.status, 'failed');
});

test('F1: the database dry-run switch also means extraction only (no model, no write)', async () => {
  const sb = fakeSb();
  const c = capture();
  const code = await ui.runCli({
    argv: [],
    env: { SUPABASE_SERVICE_KEY: 'k' },
    deps: {
      createSupabaseClient: () => ({ sbSelect: async () => [], sbInsert: sb.sbInsert }),
      cronGuardShouldSkip: async () => false,
      loadConfig: async () => ({ dryRun: true, supabaseKey: 'k' }),
      generate: () => {
        throw new Error('generate must not be called');
      },
      listFiles: () => ['app/a.tsx'],
      readFile: () => '<p>Some real copy here</p>',
    },
    log: c.log,
    logError: c.logError,
  });
  assert.equal(code, 0);
  assert.equal(sb.inserted.length, 0);
});

// ---- F6: start point rotates by ISO week ---------------------------------

test('F6: isoWeekNumber follows ISO 8601 and rotateFiles keeps every file exactly once', () => {
  assert.equal(ui.isoWeekNumber(new Date('2020-12-31T12:00:00Z')), 53);
  assert.equal(ui.isoWeekNumber(new Date('2021-01-04T12:00:00Z')), 1);
  assert.equal(ui.isoWeekNumber(new Date('2026-10-05T12:00:00Z')), 41);
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const week = (i) => new Date(Date.UTC(2026, 9, 5 + 7 * i, 12));
  assert.deepEqual(ui.rotateFiles(list, week(0), 4), ui.rotateFiles(list, week(0), 4));
  const starts = [0, 1, 2, 3].map((i) => ui.rotateFiles(list, week(i), 4).files[0]);
  assert.equal(new Set(starts).size, 4, 'four consecutive weeks start at four different files');
  for (let i = 0; i < 4; i += 1) assert.deepEqual([...ui.rotateFiles(list, week(i), 4).files].sort(), list);
  assert.equal(ui.rotationOffset(0, week(0)), 0);
  assert.equal(ui.rotationOffset(1, week(1)), 0);
});

test('REGRESSION F6: with a budget that covers 2 of 8 files, four weeks still review every file', async () => {
  const reviewed = new Set();
  for (let i = 0; i < 4; i += 1) {
    let started = 0;
    const gen = async (key, opts) => {
      reviewed.add(opts.user.match(/File: (\S+)/)[1]);
      return OK_EMPTY;
    };
    const { call } = runWith(copyTree(8), {
      generate: gen,
      now: new Date(Date.UTC(2026, 9, 5 + 7 * i, 12)),
      rotationWindows: 4,
      budgetCheck: () => started++ >= 2,
    });
    await call;
  }
  assert.equal(reviewed.size, 8, 'tail files must not starve behind the same head files');
});

// ---- F7: separate error labels, validated model issues -------------------

test('REGRESSION F7: an unreadable model reply is not labelled "no AI cascade reachable"', async () => {
  const strings = [{ text: 'Some real copy', kind: 'jsx-text' }];
  const parse = await reviewFile({ filePath: 'app/p.tsx', strings, generate: stubGenerate('sorry, no json here') });
  assert.equal(parse.failure, 'parse');
  assert.match(parse.reason, /could not be read/);
  assert.doesNotMatch(parse.reason, /no AI cascade reachable/);
  const chain = await reviewFile({ filePath: 'app/p.tsx', strings, generate: failingGenerate() });
  assert.equal(chain.failure, 'chain');
  assert.match(chain.reason, /no AI cascade reachable/);
});

test('REGRESSION F7: model issues are validated for shape, length and on-screen quote', () => {
  const strings = [
    { text: 'Your going to love this', kind: 'jsx-text' },
    { text: 'Save changes', kind: 'jsx-text' },
  ];
  const good = { original: 'Your going to love this', problem: "should be you're", suggested_fix: "You're going to love this", extra: 'dropped' };
  const { issues, dropped } = ui.sanitizeIssues(
    [
      good,
      { original: 'A line the page never shows', problem: 'p', suggested_fix: 'f' },
      { original: 'Save changes', problem: 'x'.repeat(301), suggested_fix: 'Save' },
      { original: 'Save changes', problem: 'p' },
      { original: 'Save changes', problem: 'p', suggested_fix: 'Save changes' },
      'a string',
      null,
      42,
      { original: 'Your going to love this', problem: 'dup', suggested_fix: 'dup fix' },
    ],
    strings
  );
  assert.deepEqual(issues, [{ original: 'Your going to love this', problem: "should be you're", suggested_fix: "You're going to love this" }]);
  assert.equal(dropped, 8);
  assert.deepEqual(ui.sanitizeIssues('none', strings), { issues: [], dropped: 0 });
});

test('F7: a reply is capped at MAX_ISSUES_PER_FILE issues', () => {
  const strings = Array.from({ length: 25 }, (_, i) => ({ text: `Copy line number ${i}`, kind: 'jsx-text' }));
  const raw = strings.map((s, i) => ({ original: s.text, problem: 'p', suggested_fix: `Fixed line ${i}` }));
  const { issues, dropped } = ui.sanitizeIssues(raw, strings);
  assert.equal(issues.length, ui.MAX_ISSUES_PER_FILE);
  assert.equal(dropped, 5);
});

test('REGRESSION F7: an invented quote never reaches the Executive handoff', async () => {
  const gen = stubGenerate(
    JSON.stringify({
      issues: [
        { original: 'Real screen copy number 1', problem: 'flat wording', suggested_fix: 'Screen copy one' },
        { original: 'Text the screen does not show', problem: 'made up', suggested_fix: 'whatever' },
      ],
    })
  );
  const { sb, call } = runWith(copyTree(1), { generate: gen });
  const run = await call;
  const handoff = sb.inserted.find((r) => r.table === 'agent_bus');
  assert.equal(handoff.row.body.files[0].issues.length, 1);
  assert.equal(run.droppedIssues, 1);
  assert.equal(labRows(sb)[0].row.meta.dropped_issues, 1);
});

// ---- F8: the CLI entry itself --------------------------------------------

test('REGRESSION F8: the real script with --dry-run and no keys counts screen text and exits 0', () => {
  const dir = tempRepo();
  try {
    const r = runScript(['--dry-run'], dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /dry run: 1 of 1 file\(s\) scanned, 1 with on-screen text/);
    assert.equal(r.stderr, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('REGRESSION F8: the real script without a key and without --dry-run fails with one plain line', () => {
  const dir = tempRepo();
  try {
    const r = runScript([], dir);
    assert.equal(r.status, 1);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.match(r.stderr, /database key is not set/);
    assert.doesNotMatch(r.stderr, /TypeError|\n\s+at /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
