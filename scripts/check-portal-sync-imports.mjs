#!/usr/bin/env node
/**
 * CLI: report any lib/ file transitively imported by the portal-sync mirrored
 * sources (COMPONENT_FILES + LIB_FILES + API_FILES) that is missing from LIB_FILES.
 * Exits 1 on drift so it can gate CI the same way tests/portal-sync-drift.test.mjs does.
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { COMPONENT_FILES, LIB_FILES, API_FILES } from './sync-portal-ui.mjs';
import { findMissingLibFiles } from './lib/portal-sync-import-graph.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXON_ROOT = join(__dirname, '..');

const { missing, allImported } = findMissingLibFiles(AXON_ROOT, {
  componentFiles: COMPONENT_FILES,
  libFiles: LIB_FILES,
  apiFiles: API_FILES,
});

console.log(`Transitively imported lib/ files: ${allImported.length}`);
console.log(`Declared in LIB_FILES: ${LIB_FILES.length}`);

if (missing.length > 0) {
  console.error(`\nMissing from LIB_FILES (${missing.length}):`);
  for (const f of missing) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nNo drift: every imported lib/ file is in LIB_FILES.');
