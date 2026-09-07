#!/usr/bin/env node
/**
 * AX-BOOT-WISDOM (BPA-C2-BRAIN-GAPS-0906, part b) — run: node tests/axon-boot-wisdom.test.mjs
 *
 * Proves the failure mode this closes: without loadBootWisdom, an agent's boot
 * context never carries any of the wisdom already absorbed by a prior
 * wisdom-absorb-loop run — these tests fail on the pre-fix code (no
 * lib/axon-boot-wisdom.mjs, nothing wired into axon-agent-boot.mjs) and pass
 * after it.
 */
import assert from 'node:assert/strict';
import {
  bootWisdomEnabled,
  formatBootWisdomBlock,
  loadBootWisdom,
} from '../lib/axon-boot-wisdom.mjs';

const stubRows = [
  {
    title: 'Delay aversion',
    principle: 'Delay aversion is empirically distinct from EF accounts.',
    application: 'Shrink waiting UX.',
    domain: 'adhd',
    source_type: 'nd_corpus',
    salience: 4.8,
  },
  {
    title: 'Plain English wins',
    principle: 'JB reads plain English, not jargon.',
    application: 'No table names in Telegram.',
    domain: 'communication',
    source_type: 'learning',
    salience: 7.1,
  },
  {
    title: 'Capacity-limited workspace',
    principle: 'Capacity-limited workspace improves high-order routing.',
    application: 'Keep ≤6 active concepts.',
    domain: 'ai_models',
    source_type: 'research',
    salience: 5.5,
  },
];

// ---------- bootWisdomEnabled ----------

assert.equal(bootWisdomEnabled({}), true, 'on by default when env var unset');
assert.equal(bootWisdomEnabled({ AXON_BOOT_WISDOM: '0' }), false, 'AXON_BOOT_WISDOM=0 turns it off');
assert.equal(bootWisdomEnabled({ AXON_BOOT_WISDOM: '1' }), true);

// ---------- formatBootWisdomBlock ----------

assert.equal(formatBootWisdomBlock([]), '', 'no rows -> no block, never an empty labelled header');

const block = formatBootWisdomBlock(stubRows);
assert.match(block, /Consolidated wisdom/, 'labelled block');
assert.ok(block.includes('Delay aversion'), 'row content present');
assert.ok(block.length <= 1500, 'stays within the ~1,500 char cap for a small input');

// ---------- loadBootWisdom: 3 stubbed rows, salience order preserved ----------

{
  const result = await loadBootWisdom({
    supabaseKey: 'test-key-not-real',
    env: {},
    // Deliberately returns rows NOT pre-sorted, to prove loadBootWisdom itself
    // guarantees salience order rather than trusting the caller.
    fetchRows: async () => stubRows,
  });

  assert.equal(result.enabled, true);
  assert.equal(result.count, 3);
  assert.ok(result.block, 'block is non-empty with 3 stubbed rows');

  // Order check: highest salience (7.1, "Plain English wins") must appear before
  // the next (5.5, "Capacity-limited workspace") which must appear before the
  // lowest (4.8, "Delay aversion").
  const iPlainEnglish = result.block.indexOf('Plain English wins');
  const iWorkspace = result.block.indexOf('Capacity-limited workspace');
  const iDelay = result.block.indexOf('Delay aversion');
  assert.ok(iPlainEnglish >= 0 && iWorkspace >= 0 && iDelay >= 0, 'all three rows present');
  assert.ok(iPlainEnglish < iWorkspace, 'highest salience row appears first');
  assert.ok(iWorkspace < iDelay, 'middle salience row appears before lowest');

  assert.deepEqual(
    result.rows.map((r) => r.title),
    ['Plain English wins', 'Capacity-limited workspace', 'Delay aversion'],
    'returned rows are re-ranked by salience desc',
  );
}

// ---------- loadBootWisdom: AXON_BOOT_WISDOM=0 -> no block at all ----------

{
  const result = await loadBootWisdom({
    supabaseKey: 'test-key-not-real',
    env: { AXON_BOOT_WISDOM: '0' },
    fetchRows: async () => stubRows,
  });
  assert.equal(result.enabled, false);
  assert.equal(result.block, '', 'env off -> empty block');
  assert.equal(result.count, 0);
  assert.deepEqual(result.rows, []);
}

// ---------- loadBootWisdom: no key -> empty, never throws ----------

{
  const result = await loadBootWisdom({ supabaseKey: '', env: {}, fetchRows: async () => stubRows });
  assert.equal(result.enabled, true, 'not disabled by env — just nothing to read without a key');
  assert.equal(result.block, '');
  assert.equal(result.count, 0);
}

// ---------- loadBootWisdom: fetchRows throws -> degrades to empty, never throws ----------

{
  const result = await loadBootWisdom({
    supabaseKey: 'test-key-not-real',
    env: {},
    fetchRows: async () => {
      throw new Error('network blip');
    },
  });
  assert.equal(result.block, '');
  assert.equal(result.count, 0);
}

console.log('axon-boot-wisdom.test.mjs OK');
