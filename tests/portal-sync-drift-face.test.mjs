#!/usr/bin/env node
/**
 * FACE-PORTAL-MOUNT-0906 — portal sync can't ship a broken THE FACE mirror.
 *
 * Same shape as tests/portal-sync-drift.test.mjs (see that file's docstring for the
 * full rationale), scoped to the live V0_FACE_* lists in scripts/sync-portal-ui.mjs:
 *
 *   (a) every V0_FACE_COMPONENT_FILES / V0_FACE_LIB_FILES / V0_FACE_API_FILES entry
 *       transitively imports only:
 *         - other lib/axon-v0/ files that are themselves in V0_FACE_LIB_FILES, or
 *         - components/axon-v0/ files that are themselves in V0_FACE_COMPONENT_FILES, or
 *         - top-level lib/*.ts(.mjs) files already declared in the flat LIB_FILES list
 *           (rewriteImports sends both to the same src/lib/axon destination, so this
 *           is the set that actually lands in the portal).
 *   (b) every listed file exists on disk (the sync would otherwise silently
 *       console.warn and skip it rather than fail).
 *
 * This does NOT check for a generateAxonReply-style signature drift the way a real
 * portal build would — that is exactly why V0_FACE_* is kept deliberately small and
 * why its own import chain was hand-verified against the legacy v0 harness's known
 * incompatibility (see the V0_FACE_* docstring in scripts/sync-portal-ui.mjs). Adding
 * a new file to any V0_FACE_* list must re-verify by hand that its import chain still
 * avoids the legacy v0-only surface (generateAxonReply and friends) — this test only
 * catches missing-from-list drift, not portal API-shape drift.
 *
 * Offline: no network, no NI-Brain, no real northside-intelligence checkout.
 *
 * Run: node --test tests/portal-sync-drift-face.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  LIB_FILES,
  V0_FACE_API_FILES,
  V0_FACE_COMPONENT_FILES,
  V0_FACE_LIB_FILES,
} from '../scripts/sync-portal-ui.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXON_ROOT = join(__dirname, '..');
const COMPONENT_V0_DIR = join(AXON_ROOT, 'components/axon-v0');
const LIB_V0_DIR = join(AXON_ROOT, 'lib/axon-v0');
const API_V0_DIR = join(AXON_ROOT, 'app/api/axon-v0');

const CODE_EXT_ORDER = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.d.ts'];

function resolveOnDisk(base) {
  for (const ext of CODE_EXT_ORDER) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

function importSpecifiers(source) {
  const specs = new Set();
  for (const m of source.matchAll(/import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  for (const m of source.matchAll(/export\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) specs.add(m[1]);
  // Bare side-effect import (`import '@/components/axon-v0/face.css';` — no `from`).
  for (const m of source.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) specs.add(m[1]);
  return specs;
}

// ── (b) every listed file exists on disk ────────────────────────────────────────────
{
  const missingComponents = V0_FACE_COMPONENT_FILES.filter((f) => !existsSync(join(COMPONENT_V0_DIR, f)));
  const missingLib = V0_FACE_LIB_FILES.filter((f) => !existsSync(join(LIB_V0_DIR, f)));
  const missingApi = V0_FACE_API_FILES.filter((f) => !existsSync(join(API_V0_DIR, f)));

  assert.deepEqual(missingComponents, [], `V0_FACE_COMPONENT_FILES entries missing on disk: ${missingComponents.join(', ')}`);
  assert.deepEqual(missingLib, [], `V0_FACE_LIB_FILES entries missing on disk: ${missingLib.join(', ')}`);
  assert.deepEqual(missingApi, [], `V0_FACE_API_FILES entries missing on disk: ${missingApi.join(', ')}`);
}

// ── (a) no import drift out of the declared Face lists ──────────────────────────────
{
  const knownV0Lib = new Set(V0_FACE_LIB_FILES);
  const knownV0Component = new Set(V0_FACE_COMPONENT_FILES.filter((f) => /\.(ts|tsx|mjs|js)$/.test(f)));
  const knownTopLevelLib = new Set(LIB_FILES);

  const entrypoints = [
    ...V0_FACE_COMPONENT_FILES.filter((f) => /\.(ts|tsx|mjs|js)$/.test(f)).map((f) => join(COMPONENT_V0_DIR, f)),
    ...V0_FACE_LIB_FILES.map((f) => join(LIB_V0_DIR, f)),
    ...V0_FACE_API_FILES.map((f) => join(API_V0_DIR, f)),
  ];

  const visited = new Set();
  const missingFromLists = new Set();
  const queue = [...entrypoints];

  while (queue.length > 0) {
    const file = queue.shift();
    const abs = resolve(file);
    if (visited.has(abs) || !existsSync(abs)) continue;
    visited.add(abs);

    let source;
    try {
      source = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    for (const spec of importSpecifiers(source)) {
      if (spec.startsWith('@/lib/axon-v0/')) {
        const name = spec.slice('@/lib/axon-v0/'.length);
        const resolved = resolveOnDisk(join(LIB_V0_DIR, name));
        if (!resolved) continue;
        const bare = name.replace(/\.(ts|tsx|mjs|js)$/, '');
        const matchesKnown = [...knownV0Lib].some((k) => k === name || k.replace(/\.(ts|tsx|mjs|js)$/, '') === bare);
        if (!matchesKnown) missingFromLists.add(`lib/axon-v0/${name} (imported, not in V0_FACE_LIB_FILES)`);
        queue.push(resolved);
      } else if (spec.startsWith('@/components/axon-v0/')) {
        const name = spec.slice('@/components/axon-v0/'.length);
        const resolved = resolveOnDisk(join(COMPONENT_V0_DIR, name));
        if (!resolved) continue;
        const bare = name.replace(/\.(ts|tsx|mjs|js)$/, '');
        const matchesKnown = [...V0_FACE_COMPONENT_FILES].some(
          (k) => k === name || k.replace(/\.(ts|tsx|mjs|js)$/, '') === bare,
        );
        if (!matchesKnown) missingFromLists.add(`components/axon-v0/${name} (imported, not in V0_FACE_COMPONENT_FILES)`);
        if (/\.(ts|tsx|mjs|js)$/.test(name)) queue.push(resolved);
      } else if (spec === '@/lib/api-base') {
        // Rewritten to a portal-variant constant (API_BASE_SOURCE), not mirrored from
        // AXON's lib/ — see scripts/sync-portal-ui.mjs.
        continue;
      } else if (spec.startsWith('@/lib/')) {
        const name = spec.slice('@/lib/'.length);
        const resolved = resolveOnDisk(join(AXON_ROOT, 'lib', name));
        if (!resolved) continue;
        const bare = name.replace(/\.(ts|tsx|mjs|js)$/, '');
        const matchesKnown = [...knownTopLevelLib].some((k) => k === name || k.replace(/\.(ts|tsx|mjs|js)$/, '') === bare);
        if (!matchesKnown) missingFromLists.add(`lib/${name} (imported, not in LIB_FILES)`);
        queue.push(resolved);
      }
      // Anything else (react, next/server, three, bare packages) isn't part of the
      // mirror's file lists and is out of scope for this drift check.
    }
  }

  assert.deepEqual(
    [...missingFromLists].sort(),
    [],
    `THE FACE's import chain reaches file(s) not declared in the sync lists: ` +
      `${[...missingFromLists].sort().join(', ')}. Add them to the matching V0_FACE_* ` +
      `list (or LIB_FILES) in scripts/sync-portal-ui.mjs, after re-verifying by hand ` +
      `that they don't pull in the legacy v0 harness's generateAxonReply surface.`,
  );

  // Sanity: the walk actually reached something, so an empty-list-typo doesn't pass by
  // vacuous truth.
  assert.ok(visited.size >= entrypoints.length, 'expected the Face import walk to visit every declared entrypoint');
}

console.log('portal-sync-drift-face.test.mjs: all assertions passed');
