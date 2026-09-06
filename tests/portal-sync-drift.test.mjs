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
 *   (c) portal-integration/.last-verified-sync/manifest.json (the audit record a real
 *       sync run leaves — see scripts/sync-portal-ui.mjs's usage comment) is missing,
 *       or is not current-shaped: no 40-hex `axonCommit`, no ISO `syncedAt`, or its
 *       recorded `libFilesCount` doesn't match LIB_FILES.length right now — i.e. the
 *       record is stale (LIB_FILES grew or shrank since the last verified run) even
 *       though nobody edited the manifest by hand.
 *
 *       NOTE what (c) does NOT do: it does not check git ancestry, and it does not
 *       diff any file tree. An ancestry check (is `axonCommit` an ancestor of `HEAD`)
 *       was tried and removed — CI checks out a shallow merge ref with no ancestry to
 *       walk, and this repo squash-merges, so the recorded branch commit is never an
 *       ancestor of `main` after merge; that made the check permanently red on `main`
 *       for a reason with nothing to do with staleness. And
 *       portal-integration/northside-intelligence/ holds only the hand-maintained
 *       overlay (portal-only registries, page shells with no AXON counterpart) — the
 *       full mirrored output (components/axon-ui, lib/axon) is never committed in this
 *       repo, it's written straight into a northside-intelligence checkout by a real
 *       sync run, so there is no tree here to diff against anyway. Confirming the sync
 *       itself is clean is what a real (or --check) run of scripts/sync-portal-ui.mjs
 *       against an actual northside-intelligence checkout is for — see this test's
 *       (a)/(b) plus that command, not this file.
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
import { COMPONENT_FILES, LIB_FILES, API_FILES } from '../scripts/sync-portal-ui.mjs';
import { findMissingLibFiles } from '../scripts/lib/portal-sync-import-graph.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXON_ROOT = join(__dirname, '..');
const LAST_VERIFIED_SYNC_MANIFEST = join(
  AXON_ROOT,
  'portal-integration/.last-verified-sync/manifest.json',
);

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

// ── (c) the last-verified-sync audit record is present and current-shaped — see the
// docstring above for exactly what this does and does not prove (no git ancestry,
// no file-tree diff) ──────────────────────────────────────────────────────────────
{
  assert.ok(
    existsSync(LAST_VERIFIED_SYNC_MANIFEST),
    `portal-integration/.last-verified-sync/manifest.json is missing — no sync run has ` +
      `been recorded for this branch. Run scripts/sync-portal-ui.mjs (--check first, ` +
      `then for real against a disposable copy — never the shared checkout) and commit ` +
      `its manifest there.`,
  );

  const manifest = JSON.parse(readFileSync(LAST_VERIFIED_SYNC_MANIFEST, 'utf8'));

  assert.match(
    manifest.axonCommit ?? '',
    /^[0-9a-f]{40}$/,
    `manifest.json axonCommit "${manifest.axonCommit}" is not a 40-hex commit SHA`,
  );
  assert.match(
    manifest.syncedAt ?? '',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    `manifest.json syncedAt "${manifest.syncedAt}" is not an ISO timestamp`,
  );
  assert.equal(
    manifest.libFilesCount,
    LIB_FILES.length,
    `manifest.json libFilesCount (${manifest.libFilesCount}) does not match the current ` +
      `LIB_FILES length (${LIB_FILES.length}) — the recorded sync run is stale. Re-run ` +
      `scripts/sync-portal-ui.mjs and update the manifest (including libFilesCount).`,
  );
}

console.log('portal-sync-drift.test.mjs: all assertions passed');
