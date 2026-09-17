#!/usr/bin/env node
/**
 * AXON-STARTER-TEMPLATES-001 unit tests — run: node tests/build-starter-kit.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildManifest, buildZip } from '../scripts/build-starter-kit.mjs';

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

// buildZip: writes a real zip containing the manifest's files.
const distDir = join(fakeRoot, 'dist');
const zipPath = buildZip({ manifest, repoRoot: fakeRoot, distDir });
assert.ok(zipPath, 'buildZip should return a path when the manifest has files');
assert.ok(existsSync(zipPath), 'zip file should exist on disk');

const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
assert.ok(listing.includes('SKILL.md'), 'zip should contain SKILL.md');
assert.ok(listing.includes('config.json'), 'zip should contain config.json');
assert.ok(!listing.includes('notes.txt'), 'zip should not contain excluded notes.txt');

// buildZip: skips (returns null, writes nothing) when the manifest is empty.
const emptyManifest = buildManifest({ sourceDirs: ['workflows-does-not-exist'], repoRoot: fakeRoot });
const emptyZipPath = buildZip({ manifest: emptyManifest, repoRoot: fakeRoot, distDir, zipName: 'empty.zip' });
assert.equal(emptyZipPath, null, 'buildZip should skip an empty manifest');
assert.ok(!existsSync(join(distDir, 'empty.zip')), 'no zip file should be written for an empty manifest');

rmSync(fakeRoot, { recursive: true, force: true });

console.log('build-starter-kit.test.mjs: all assertions passed');
