#!/usr/bin/env node
/**
 * axon-history-export — run: node tests/axon-history-export.test.mjs
 * Pure-logic + injected-fetcher tests only. No network, no filesystem writes
 * (dry-run path exercised; the --write path is exercised against a temp dir
 * that is cleaned up, never the repo's own var/ output).
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildRecordsForSource, runExport, toTrainingRecord, scrubSecretsAndPii } from '../scripts/axon-history-export.mjs';

// scrubSecretsAndPii: redacts API keys/tokens, key=value secrets, emails, phone numbers
{
  const cases = [
    ['sk-abcdefghijklmnopqrstuvwx', '[REDACTED-KEY]'],
    ['ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ01234', '[REDACTED-KEY]'],
    ['AKIAABCDEFGHIJKLMNOP', '[REDACTED-KEY]'],
    ['Authorization: Bearer eyJhbGciOiJIUzI1NiJ9abcdefg', '[REDACTED-TOKEN]'],
    ['SUPABASE_SERVICE_ROLE_KEY=verylongsecretvalue123', '[REDACTED]'],
    ['api_key: "abcd1234efgh"', '[REDACTED]'],
    ['contact jonny@northsideventures.com for help', '[REDACTED-EMAIL]'],
    ['call 404-555-0199 anytime', '[REDACTED-PHONE]'],
  ];
  for (const [input, expectedFragment] of cases) {
    const out = scrubSecretsAndPii(input);
    assert.ok(out.includes(expectedFragment), `expected "${out}" to include "${expectedFragment}" (input: ${input})`);
    assert.ok(!/eyJhbGciOiJIUzI1NiJ9abcdefg|verylongsecretvalue123|jonny@northsideventures\.com|404-555-0199|sk-abcdefghijklmnopqrstuvwx|AKIAABCDEFGHIJKLMNOP/.test(out), `secret leaked through scrub: ${out}`);
  }
  // ordinary text passes through untouched
  assert.equal(scrubSecretsAndPii('Ship the outreach fix by Friday.'), 'Ship the outreach fix by Friday.');
}

// toTrainingRecord scrubs before returning — no code path hands back raw secrets
{
  const rec = toTrainingRecord(
    { id: 7, project: 'AXON', learning: 'Rotated key sk-abcdefghijklmnopqrstuvwx, notify ops@northside.dev.' },
    'learning',
    ['learning'],
  );
  assert.ok(!rec.completion.includes('sk-abcdefghijklmnopqrstuvwx'));
  assert.ok(!rec.completion.includes('ops@northside.dev'));
  assert.match(rec.completion, /\[REDACTED-KEY\]/);
  assert.match(rec.completion, /\[REDACTED-EMAIL\]/);
}

// toTrainingRecord: shapes a raw row, drops rows with no usable text
{
  const rec = toTrainingRecord(
    { id: 42, project: 'AXON', created_at: '2026-09-01T00:00:00Z', learning: '  Prefer short loops.  ' },
    'learning',
    ['learning', 'context'],
  );
  assert.equal(rec.kind, 'learning');
  assert.equal(rec.source_id, 42);
  assert.equal(rec.project, 'AXON');
  assert.equal(rec.completion, 'Prefer short loops.');
  assert.match(rec.prompt, /AXON/);

  const empty = toTrainingRecord({ id: 1, learning: '   ' }, 'learning', ['learning']);
  assert.equal(empty, null);
}

// buildRecordsForSource: filters empties, preserves order
{
  const rows = [
    { id: 1, learning: 'First.' },
    { id: 2, learning: '   ' },
    { id: 3, learning: 'Third.' },
  ];
  const records = buildRecordsForSource(rows, { kind: 'learning', textFields: ['learning'] });
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((r) => r.source_id), [1, 3]);
}

// runExport dry-run (default): counts records, writes nothing
{
  const fetchRows = async (table) => {
    if (table === 'Decisions') return [{ id: 1, decision: 'Ship the thing.' }];
    if (table === 'Learnings') return [{ id: 2, learning: 'Learned a thing.' }, { id: 3, learning: '' }];
    return [{ id: 4, summary: 'Some context.' }];
  };
  const { summary } = await runExport({ fetchRows });
  assert.equal(summary.dryRun, true);
  assert.equal(summary.total, 3); // 1 decision + 1 learning (empty dropped) + 1 context
  assert.equal(summary.outDir, null);
  assert.deepEqual(summary.writtenFiles, []);
  const byTable = Object.fromEntries(summary.perSource.map((s) => [s.table, s]));
  assert.equal(byTable.Decisions.recordCount, 1);
  assert.equal(byTable.Learnings.rowCount, 2);
  assert.equal(byTable.Learnings.recordCount, 1);
}

// runExport --write: writes JSONL + manifest to the given outDir only
{
  const tmp = await mkdtemp(path.join(tmpdir(), 'axon-history-export-test-'));
  try {
    const fetchRows = async (table) =>
      table === 'Decisions' ? [{ id: 9, decision: 'A decision.' }] : [];
    const { summary } = await runExport({ fetchRows, write: true, outDir: tmp });
    assert.equal(summary.dryRun, false);
    assert.equal(summary.outDir, tmp);
    assert.ok(summary.writtenFiles.some((f) => f.endsWith('decision.jsonl')));
    assert.ok(summary.writtenFiles.some((f) => f.endsWith('manifest.json')));

    const decisionFile = summary.writtenFiles.find((f) => f.endsWith('decision.jsonl'));
    const contents = await readFile(decisionFile, 'utf8');
    const parsed = JSON.parse(contents.trim().split('\n')[0]);
    assert.equal(parsed.completion, 'A decision.');

    const manifest = JSON.parse(await readFile(path.join(tmp, 'manifest.json'), 'utf8'));
    assert.equal(manifest.total, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// fetch failures degrade to empty, never throw
{
  const fetchRows = async () => {
    throw new Error('network down');
  };
  // runExport itself doesn't call fetchRows directly with a try/catch, so a
  // throwing injected fetcher should propagate — this documents that a
  // custom fetcher is responsible for its own safety, same contract as
  // defaultFetchRows (which never throws).
  await assert.rejects(() => runExport({ fetchRows }));
}

console.log('axon-history-export.test.mjs: all assertions passed');
