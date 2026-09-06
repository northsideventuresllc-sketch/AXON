/**
 * PORTAL SYNC IMPORT GRAPH — walks the relative `lib/` import graph starting from
 * everything the portal sync actually mirrors (components, lib files already on the
 * list, and the API routes) and reports every `lib/*` file that ends up imported but
 * is missing from LIB_FILES.
 *
 * Used by:
 *   - scripts/check-portal-sync-imports.mjs (CLI, run by hand or in CI)
 *   - tests/portal-sync-drift.test.mjs (fails the suite on drift)
 *
 * Deliberately conservative like the delete guard: this only follows RELATIVE
 * `lib/`-rooted imports it can resolve on disk (`@/lib/...` and `./...`/`../...`
 * that resolve under lib/). Anything it can't resolve is left alone rather than
 * guessed at — a missed import is a real drift bug to go add manually, a false
 * positive here would just be noise nobody trusts.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

const CODE_EXT_ORDER = ['', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.d.ts'];

/** Resolve a specifier (already an absolute-ish path with no extension) to a real file. */
function resolveOnDisk(base) {
  for (const ext of CODE_EXT_ORDER) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of ['/index.ts', '/index.tsx', '/index.mjs', '/index.js']) {
    const candidate = base + ext;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every static import/require specifier in a source file. */
function importSpecifiers(source) {
  const specs = new Set();
  for (const m of source.matchAll(/import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  for (const m of source.matchAll(/export\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  return specs;
}

/**
 * Walk relative/`@/lib` imports transitively starting from a set of absolute
 * entrypoint file paths. Returns { libFiles: Set<basename under lib/>, visited }.
 */
export function walkLibImports(axonRoot, entrypoints) {
  const libDir = join(axonRoot, 'lib');
  const libFiles = new Set(); // basenames relative to lib/
  const visitedFiles = new Set();
  const queue = [...entrypoints];

  while (queue.length > 0) {
    const file = queue.shift();
    const abs = resolve(file);
    if (visitedFiles.has(abs) || !existsSync(abs)) continue;
    visitedFiles.add(abs);

    let source;
    try {
      source = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }

    for (const spec of importSpecifiers(source)) {
      let targetBase = null;

      if (spec.startsWith('@/lib/')) {
        targetBase = join(axonRoot, 'lib', spec.slice('@/lib/'.length));
      } else if (spec.startsWith('.')) {
        targetBase = resolve(dirname(abs), spec);
      } else {
        continue; // bare package specifier — not something the sync mirrors
      }

      const resolved = resolveOnDisk(targetBase);
      if (!resolved) continue;

      const relToLib = relative(libDir, resolved);
      if (relToLib.startsWith('..')) continue; // resolved outside lib/ (e.g. components/, app/)

      libFiles.add(relToLib);
      if (!visitedFiles.has(resolved)) queue.push(resolved);
    }
  }

  return { libFiles, visitedFiles };
}

/**
 * Compute the set of lib/ files transitively imported by the sync's mirrored
 * sources but missing from its LIB_FILES list.
 *
 * @param {string} axonRoot
 * @param {{ componentFiles: string[], libFiles: string[], apiFiles: string[] }} manifest
 * @returns {{ missing: string[], allImported: string[] }}
 */
/**
 * lib/ files the sync legitimately handles WITHOUT a LIB_FILES entry — never real
 * drift, so the checker must not flag them:
 *   - api-base.ts: the portal gets a hand-written variant (API_BASE_SOURCE in
 *     sync-portal-ui.mjs), never AXON's own lib/api-base.ts content.
 *   - paths.ts: every `@/lib/paths` import is rewritten to `@/lib/axon/app-path`
 *     (rewriteImports), so AXON's lib/paths.ts content is never copied either.
 */
export const SYNC_SPECIAL_CASED_LIB_FILES = new Set(['api-base.ts', 'paths.ts']);

export function findMissingLibFiles(axonRoot, manifest) {
  const entrypoints = [
    ...manifest.componentFiles.map((f) => join(axonRoot, 'components/axon', f)),
    ...manifest.libFiles.map((f) => join(axonRoot, 'lib', f)),
    ...manifest.apiFiles.map((f) => join(axonRoot, 'app/api/axon', f)),
  ].filter((f) => existsSync(f));

  const { libFiles } = walkLibImports(axonRoot, entrypoints);

  const declared = new Set(manifest.libFiles);
  const missing = [...libFiles]
    .filter((f) => !declared.has(f) && !SYNC_SPECIAL_CASED_LIB_FILES.has(f))
    .sort();

  return { missing, allImported: [...libFiles].sort() };
}
