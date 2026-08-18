#!/usr/bin/env node
/**
 * AXON-STARTER-TEMPLATES-001 unit tests — run: node tests/build-starter-kit.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest } from '../scripts/build-starter-kit.mjs';

// Build a throwaway fake repo with one real dir and one missing dir.
const fakeRoot = mkdtempSync(join(tmpdir(), 'starter-kit-test-'));
mkdirSync(join(fakeRoot, 'skills', 'nested'), { recursive: true });
writeFileSync(join(fakeRoot, 'skills', 'SKILL.md'), '# fake skill\n');
writeFileSync(join(fakeRoot, 'skills', 'nested', 'notes.txt'), 'ignored ext\n');
writeFileSync(join(fakeRoot, 'skills', 'nested', 'config.json'), '{}\n');

const manifest = buildManifest({
  sourceDirs: ['skills', 'workflows-does-not-exist'],
  repoRoot: fakeRoot,
});

assert.equal(manifest.dispatch_code, 'AXON-STARTER-TEMPLATES-001');
assert.equal(manifest.increment, 1);
assert.equal(manifest.file_count, 2, 'should find SKILL.md and nested config.json, skip .txt');
assert.ok(manifest.files.some((f) => f.path.endsWith('SKILL.md')));
assert.ok(manifest.files.some((f) => f.path.endsWith('config.json')));
assert.ok(!manifest.files.some((f) => f.path.endsWith('notes.txt')), '.txt must be excluded');
assert.deepEqual(manifest.source_dirs_missing, ['workflows-does-not-exist']);

rmSync(fakeRoot, { recursive: true, force: true });

console.log('build-starter-kit.test.mjs: all assertions passed');
