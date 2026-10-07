#!/usr/bin/env node
/**
 * AXON-WIRING-1006 part 2 — findWiringPoint is a REAL grep over lib/ and
 * scripts/, never a fabricated path. Run: node tests/axon-wiring-point.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findWiringPoint, extractKeywords } from '../lib/axon-wiring-point.mjs';
import { THREE_AREAS, REPORT_SECTION_BY_LANE, COMPETITOR_LANE_ID } from '../lib/axon-self-research-build-plans.mjs';

// extractKeywords: lowercases, dedupes, drops stopwords/short tokens, caps length
assert.deepEqual(extractKeywords('Build a Heartbeat Entry for the Nightly Digest'), ['heartbeat', 'entry', 'nightly', 'digest']);
assert.deepEqual(extractKeywords(''), []);
assert.equal(extractKeywords('one two three four five six seven eight nine ten eleven twelve', 3).length, 3);

// findWiringPoint: no keywords at all -> honest "nothing to grep for", never a path
assert.deepEqual(findWiringPoint({}), {
  file: null,
  matched_keywords: [],
  keywords: [],
  reason: 'no usable keywords in build_plan — nothing to grep for',
});

// findWiringPoint: build a fixture repo tree so this never depends on live AXON source drifting.
const fixtureRoot = mkdtempSync(join(tmpdir(), 'axon-wiring-point-'));
try {
  writeFileSync(
    join(fixtureRoot, 'lib-digest-helper.mjs'),
    '// handles the nightly digest heartbeat row insert for axon_nightly_digest\nexport function recordHeartbeat() {}\n',
  );
  writeFileSync(
    join(fixtureRoot, 'lib-unrelated.mjs'),
    '// totally unrelated telegram routing helper\nexport function sendToJb() {}\n',
  );

  // Real match: keywords from the build plan are actually found in one fixture file.
  const hit = findWiringPoint(
    { what_to_build: 'write a heartbeat row into axon_nightly_digest after every nightly run' },
    { rootDir: fixtureRoot, scanDirs: ['.'] },
  );
  assert.equal(hit.file, 'lib-digest-helper.mjs');
  assert.ok(hit.matched_keywords.length > 0);
  assert.equal(hit.reason, null);

  // Honest miss: keywords that grep nothing existing get a "net-new file" reason, never a guessed path.
  const miss = findWiringPoint(
    { what_to_build: 'invent a brand new quantum teleportation beacon widget' },
    { rootDir: fixtureRoot, scanDirs: ['.'] },
  );
  assert.equal(miss.file, null);
  assert.match(miss.reason, /net-new file/);

  // Missing scan dirs never throw — they're just skipped (grep over a dir that doesn't exist yet).
  const noDirs = findWiringPoint(
    { what_to_build: 'heartbeat row' },
    { rootDir: fixtureRoot, scanDirs: ['does-not-exist'] },
  );
  assert.equal(noDirs.file, null);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

// THREE_AREAS: psychology_ux was renamed to neurodivergence_ux (AXON-WIRING-1006) —
// the old id must be gone, not just aliased, so nothing silently writes to both.
assert.ok(THREE_AREAS.some((a) => a.id === 'neurodivergence_ux'), 'expected a neurodivergence_ux lane');
assert.ok(!THREE_AREAS.some((a) => a.id === 'psychology_ux'), 'psychology_ux lane should be fully replaced, not kept alongside');
const ndArea = THREE_AREAS.find((a) => a.id === 'neurodivergence_ux');
assert.match(ndArea.query, /neurodivergen|adhd|dyslexi/i);
assert.match(ndArea.instruction, /neurodivergen/i);

// REPORT_SECTION_BY_LANE: AXON Research's agent note requires competitor+ai_news findings
// tagged for SENSEI report sections 2 and 4 respectively (not any other pair of numbers).
assert.equal(REPORT_SECTION_BY_LANE[COMPETITOR_LANE_ID], 2);
assert.equal(REPORT_SECTION_BY_LANE.ai_news_build, 4);
assert.equal(REPORT_SECTION_BY_LANE.neurodivergence_ux, undefined, 'neurodivergence lane is not a SENSEI report section 2/4 feed');

console.log('axon-wiring-point.test.mjs: all assertions passed');
