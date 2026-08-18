#!/usr/bin/env node
/**
 * AXON-STARTER-TEMPLATES-001 — increment 1: manifest builder.
 *
 * Scans the repo for the artifact classes the nightly AXON build produces
 * (skills, workflows, agent templates) and writes a JSON manifest describing
 * what would ship in the starter kit bundled with the AXON default download.
 *
 * SCOPE OF THIS INCREMENT (explicit, not silently partial):
 *   - Discovers candidate source paths and writes dist/starter-kit-manifest.json.
 *   - Does NOT yet zip the bundle or wire into the download flow — that is
 *     increment 2, tracked under the same dispatch code (AXON-STARTER-TEMPLATES-001).
 *   - Packaging deliberately avoids adding a new npm dependency (archiver/jszip)
 *     in this pass; increment 2 should either add one deliberately or shell out
 *     to the system `zip` binary — a dependency change should be its own
 *     reviewed step, not bundled into the manifest scaffold.
 *
 * Usage:
 *   node scripts/build-starter-kit.mjs
 *   node scripts/build-starter-kit.mjs --source-dirs=.claude/skills,.cursor/skills
 *
 * SOURCE LOCATION — corrected after real recon (2026-08-18, post-review):
 * this repo has no top-level agents/skills/templates/workflows dirs. The
 * real skill/agent-instruction content lives at .claude/skills/ and
 * .cursor/skills/ (confirmed present and non-empty via live `find` on the
 * mini). A separate DB-backed source, `nvg_skill_registry` (NI-Brain,
 * kxijunwgbrlfzvgkhklo, 27 rows as of this check), also holds registered
 * skills and is NOT covered by this filesystem scan — increment 2 should
 * decide whether the starter kit needs both sources or just one, and if
 * both, add a DB-export step alongside this file scan rather than trying
 * to fake DB rows into the filesystem walk.
 *
 * First eligible run per the dispatch ticket = next nightly cycle after
 * 2026-08-17. This script is safe to run standalone any time — it only reads
 * the filesystem and writes dist/starter-kit-manifest.json.
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// Candidate source directories for "skills/workflows/agent templates" —
// only directories that actually exist are scanned, so this stays safe as
// the repo's structure evolves. Corrected to real, confirmed-present paths
// (.claude/skills, .cursor/skills) after the original agents/skills/
// templates/workflows guess scanned to file_count: 0 on the live repo.
const DEFAULT_SOURCE_DIRS = ['.claude/skills', '.cursor/skills'];

const STARTER_KIT_EXTENSIONS = new Set(['.md', '.mjs', '.json', '.yml', '.yaml']);

function parseSourceDirsArg(argv) {
  const flag = argv.find((a) => a.startsWith('--source-dirs='));
  if (!flag) return DEFAULT_SOURCE_DIRS;
  return flag
    .slice('--source-dirs='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function walk(dir, fileList = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return fileList;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue;
      walk(full, fileList);
    } else if (STARTER_KIT_EXTENSIONS.has(extname(entry))) {
      fileList.push(full);
    }
  }
  return fileList;
}

export function buildManifest({ sourceDirs = DEFAULT_SOURCE_DIRS, repoRoot = REPO_ROOT } = {}) {
  const scanned = [];
  const missingDirs = [];

  for (const dir of sourceDirs) {
    const abs = join(repoRoot, dir);
    if (!existsSync(abs)) {
      missingDirs.push(dir);
      continue;
    }
    const files = walk(abs);
    for (const f of files) {
      const rel = relative(repoRoot, f);
      const stat = statSync(f);
      scanned.push({
        path: rel,
        category: dir,
        bytes: stat.size,
      });
    }
  }

  return {
    generated_at_note: 'stamp actual timestamp when writing, not computed here (no Date.now in shared logic)',
    dispatch_code: 'AXON-STARTER-TEMPLATES-001',
    increment: 1,
    source_dirs_requested: sourceDirs,
    source_dirs_missing: missingDirs,
    file_count: scanned.length,
    files: scanned,
    next_increment: 'zip dist/starter-kit-manifest.json[*].path into dist/axon-starter-kit.zip and wire into the AXON default download flow',
  };
}

function main() {
  const sourceDirs = parseSourceDirsArg(process.argv.slice(2));
  const manifest = buildManifest({ sourceDirs });
  manifest.generated_at = new Date().toISOString();

  const distDir = join(REPO_ROOT, 'dist');
  mkdirSync(distDir, { recursive: true });
  const outPath = join(distDir, 'starter-kit-manifest.json');
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`starter-kit manifest written: ${outPath}`);
  console.log(`files found: ${manifest.file_count}`);
  if (manifest.source_dirs_missing.length) {
    console.log(`source dirs not present in this repo (skipped): ${manifest.source_dirs_missing.join(', ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
