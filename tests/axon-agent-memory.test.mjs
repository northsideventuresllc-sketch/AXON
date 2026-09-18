#!/usr/bin/env node
/**
 * AX-SUBAGENT-MEMORY-FIELD-0904 fallback — run: node tests/axon-agent-memory.test.mjs
 *
 * Proves the failure mode this closes: without appendAgentMemory/
 * formatAgentMemoryBlock, an AXON persona's boot context never carries any of
 * its own past self-curated notes — every boot restarts cold on its own
 * history, even though axon_venture_agents.config already exists per-agent
 * and needs no migration to carry a `memory` array. These tests fail on the
 * pre-fix code (no lib/axon-agent-memory.mjs) and pass after it.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_MAX_MEMORY_ENTRIES,
  MAX_MEMORY_BLOCK_CHARS,
  appendAgentMemory,
  formatAgentMemoryBlock,
} from '../lib/axon-agent-memory.mjs';

// ---------- formatAgentMemoryBlock ----------

assert.equal(formatAgentMemoryBlock([]), '', 'no entries -> no block, never an empty labelled header');
assert.equal(formatAgentMemoryBlock(), '', 'undefined -> no block, never throws');

{
  const block = formatAgentMemoryBlock([
    { note: 'Skipped a queued ticket without council — do not repeat.', at: '2026-09-10T00:00:00Z' },
    { note: 'JB wants plain English, no table names, in every Telegram ping.', at: '2026-09-12T00:00:00Z' },
  ]);
  assert.match(block, /Your memory/, 'labelled block');
  assert.ok(block.includes('Skipped a queued ticket'), 'first entry present');
  assert.ok(block.includes('JB wants plain English'), 'second entry present');
  assert.ok(block.includes('2026-09-10'), 'date prefix present');
  // Order: entries render in the order given (most recent last, matching how
  // appendAgentMemory appends), oldest first in the rendered block.
  assert.ok(
    block.indexOf('Skipped a queued ticket') < block.indexOf('JB wants plain English'),
    'entries render in input order (oldest first)',
  );
  assert.ok(block.length <= MAX_MEMORY_BLOCK_CHARS, 'stays within the block char cap');
}

{
  // A very long run of entries must not blow the cap open.
  const many = Array.from({ length: 50 }, (_, i) => ({
    note: `Entry number ${i} with some real content padding it out to a reasonable length.`,
    at: '2026-09-01T00:00:00Z',
  }));
  const block = formatAgentMemoryBlock(many);
  assert.ok(block.length <= MAX_MEMORY_BLOCK_CHARS, 'caps output even with many entries');
}

// ---------- appendAgentMemory: validation, never throws ----------

{
  const result = await appendAgentMemory({ agentId: '', note: 'x', client: {} });
  assert.equal(result.ok, false);
  assert.match(result.reason, /missing/);
}

{
  const result = await appendAgentMemory({ agentId: 'abc', note: '', client: {} });
  assert.equal(result.ok, false, 'empty note rejected');
}

{
  const result = await appendAgentMemory({ agentId: 'abc', note: 'real note', supabaseKey: '' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no supabase key/);
}

// ---------- appendAgentMemory: fake client, first write on empty config ----------

{
  const writes = [];
  const fakeClient = {
    sbSelect: async () => [{ config: { instructions: 'be careful' } }],
    sbPatch: async (table, filter, row) => {
      writes.push({ table, filter, row });
      return row;
    },
  };
  const result = await appendAgentMemory({
    agentId: 'agent-1',
    note: 'First real note from a completed task.',
    client: fakeClient,
    now: () => '2026-09-18T00:00:00Z',
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(writes.length, 1, 'exactly one write, no wasted round trips');
  assert.equal(writes[0].table, 'axon_venture_agents');
  assert.equal(writes[0].filter, 'id=eq.agent-1');
  assert.equal(writes[0].row.config.instructions, 'be careful', 'existing config keys survive the read-modify-write');
  assert.deepEqual(writes[0].row.config.memory, [
    { note: 'First real note from a completed task.', at: '2026-09-18T00:00:00Z' },
  ]);
}

// ---------- appendAgentMemory: appends to existing memory, caps at maxEntries ----------

{
  const existing = Array.from({ length: DEFAULT_MAX_MEMORY_ENTRIES }, (_, i) => ({
    note: `old note ${i}`,
    at: '2026-09-01T00:00:00Z',
  }));
  const fakeClient = {
    sbSelect: async () => [{ config: { memory: existing } }],
    sbPatch: async (table, filter, row) => row,
  };
  const result = await appendAgentMemory({
    agentId: 'agent-2',
    note: 'newest note',
    client: fakeClient,
    now: () => '2026-09-18T00:00:00Z',
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, DEFAULT_MAX_MEMORY_ENTRIES, 'capped, oldest dropped, list does not grow unbounded');
}

// ---------- appendAgentMemory: no matching agent row -> fails cleanly ----------

{
  const fakeClient = { sbSelect: async () => [], sbPatch: async () => { throw new Error('should not be called'); } };
  const result = await appendAgentMemory({ agentId: 'ghost', note: 'x', client: fakeClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no axon_venture_agents row/);
}

// ---------- appendAgentMemory: read failure degrades to ok:false, never throws ----------

{
  const fakeClient = {
    sbSelect: async () => {
      throw new Error('network blip');
    },
    sbPatch: async () => { throw new Error('should not be called'); },
  };
  const result = await appendAgentMemory({ agentId: 'agent-3', note: 'x', client: fakeClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /read failed/);
}

// ---------- appendAgentMemory: write failure reports ok:false but never throws ----------

{
  const fakeClient = {
    sbSelect: async () => [{ config: {} }],
    sbPatch: async () => {
      throw new Error('HTTP 500');
    },
  };
  const result = await appendAgentMemory({ agentId: 'agent-4', note: 'x', client: fakeClient });
  assert.equal(result.ok, false);
  assert.match(result.reason, /write failed/);
}

console.log('axon-agent-memory.test.mjs OK');
