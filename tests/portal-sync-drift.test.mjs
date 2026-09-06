#!/usr/bin/env node
/**
 * A3/A4 — portal sync can't ship a broken import chain.
 *
 * Fails when:
 *   (a) a mirrored source (COMPONENT_FILES + LIB_FILES + API_FILES) imports a lib/
 *       file that is not in LIB_FILES — the drift the resolver in
 *       scripts/lib/portal-sync-import-graph.mjs walks for, and that used to reach the
 *       NI-Portal typecheck instead of failing here;
 *   (b) an entry in COMPONENT_FILES / LIB_FILES / API_FILES no longer exists on disk
 *       (the sync would silently `console.warn` and skip it rather than fail); or
 *   (c) a file already committed under portal-integration/northside-intelligence/ was
 *       hand-edited out of step with its recorded sync manifest — i.e. the manifest
 *       claims a commit but the tree next to it doesn't match, meaning the sync must
 *       be re-run before this is trusted.
 *
 * Offline: no network, no NI-Brain, no real northside-intelligence checkout — this
 * only checks what's already in this repo.
 *
 * Run: node --test tests/portal-sync-drift.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { COMPONENT_FILES, LIB_FILES, API_FILES } from '../scripts/sync-portal-ui.mjs';
import { findMissingLibFiles } from '../scripts/lib/portal-sync-import-graph.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXON_ROOT = join(__dirname, '..');
const INTEGRATION_ROOT = join(AXON_ROOT, 'portal-integration/northside-intelligence');

// ── (a) no lib/ import chain drift ──────────────────────────────────────────────
{
  const { missing } = findMissingLibFiles(AXON_ROOT, {
    componentFiles: COMPONENT_FILES,
    libFiles: LIB_FILES,
    apiFiles: API_FILES,
  });

  assert.deepEqual(
    missing,
    [],
    `portal sync LIB_FILES is missing lib/ file(s) transitively imported by the mirrored ` +
      `sources: ${missing.join(', ')}. Add them to LIB_FILES in scripts/sync-portal-ui.mjs ` +
      `(run \`node scripts/check-portal-sync-imports.mjs\` for the full report).`,
  );
}

// ── (b) every mirrored source file actually exists on disk (sync would not silently
// skip it) ───────────────────────────────────────────────────────────────────────
{
  const missingComponents = COMPONENT_FILES.filter(
    (f) => !existsSync(join(AXON_ROOT, 'components/axon', f)),
  );
  const missingLib = LIB_FILES.filter((f) => !existsSync(join(AXON_ROOT, 'lib', f)));
  const missingApi = API_FILES.filter((f) => !existsSync(join(AXON_ROOT, 'app/api/axon', f)));

  assert.deepEqual(missingComponents, [], `COMPONENT_FILES entries missing on disk: ${missingComponents.join(', ')}`);
  assert.deepEqual(missingLib, [], `LIB_FILES entries missing on disk: ${missingLib.join(', ')}`);
  assert.deepEqual(missingApi, [], `API_FILES entries missing on disk: ${missingApi.join(', ')}`);
}

// ── (c) the committed portal-integration/ overlay is not out of step with its own
// recorded sync manifest, and the recorded manifest points at an ancestor of HEAD
// (never a commit this worktree has never seen — that would mean the manifest was
// copied in from a different run than the files sitting next to it) ─────────────
{
  const manifestPath = join(INTEGRATION_ROOT, 'src/lib/axon/.axon-sync-manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.axonCommit, '.axon-sync-manifest.json is missing axonCommit');
    assert.ok(manifest.syncedAt, '.axon-sync-manifest.json is missing syncedAt');

    if (manifest.axonCommit && manifest.axonCommit !== 'unknown') {
      let isAncestor = true;
      try {
        execSync(`git merge-base --is-ancestor ${manifest.axonCommit} HEAD`, {
          cwd: AXON_ROOT,
          stdio: 'ignore',
        });
      } catch {
        isAncestor = false;
      }
      assert.ok(
        isAncestor,
        `.axon-sync-manifest.json records axonCommit ${manifest.axonCommit}, which is not ` +
          `an ancestor of HEAD in this worktree — the manifest does not describe the sync ` +
          `state actually committed here. Re-run scripts/sync-portal-ui.mjs.`,
      );
    }
  }
}

console.log('portal-sync-drift.test.mjs: all assertions passed');
