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
