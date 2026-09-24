#!/usr/bin/env node
/**
 * AX-SUBAGENT-MEMORY-FIELD-0904 — run: node tests/axon-agent-memory-writeback.test.mjs
 *
 * Proves the failure mode this closes: without recordAgentMemory + the boot-context
 * wiring in lib/axon-agent-boot.mjs, a correction written after a task never reaches
 * that persona's own NI-Brain slice, and even if it somehow did, nothing at boot would
 * ever surface it — a persona always restarted cold. These tests fail on the pre-fix
 * code (no lib/axon-agent-memory-writeback.mjs, nothing wired into
 * lib/axon-agent-boot.mjs) and pass after it. Mirrors tests/axon-boot-wisdom.test.mjs's
 * pattern: stub the I/O boundary, assert on the pure/deterministic behavior around it.
 */
import assert from 'node:assert/strict';
import {
  memoryFingerprint,
  mergeMemoryNotes,
  formatAgentMemoryBlock,
  recordAgentMemory,
  MAX_MEMORY_NOTES,
  MAX_MEMORY_NOTES_CHARS,
} from '../lib/axon-agent-memory-writeback.mjs';

// ---------- memoryFingerprint ----------

assert.equal(memoryFingerprint('done_tool'), memoryFingerprint('done_tool'), 'same input -> same fingerprint');
assert.equal(
  memoryFingerprint('Done_Tool'),
  memoryFingerprint('done_tool'),
  'case/whitespace-insensitive, so a topic always supersedes itself',
);
assert.notEqual(memoryFingerprint('done_tool'), memoryFingerprint('council_verdict'), 'different inputs differ');

// ---------- mergeMemoryNotes: dedup / supersede-in-place ----------

{
  const existing = [];
  const withFirst = mergeMemoryNotes(existing, {
    note: 'First correction about retry timing.',
    source: 'done_tool',
    taskRef: 'req_1',
  });
  assert.equal(withFirst.length, 1, 'first note lands as a single entry');
  assert.equal(withFirst[0].source, 'done_tool');

  const withSecondSameSource = mergeMemoryNotes(withFirst, {
    note: 'Updated correction — retry timing was actually fine, the bug was elsewhere.',
    source: 'done_tool',
    taskRef: 'req_2',
  });
  assert.equal(
    withSecondSameSource.length,
    1,
    'a second note with the same source/topic supersedes the first in place, never appends a duplicate',
  );
  assert.ok(
    withSecondSameSource[0].note.includes('actually fine'),
    'the surviving entry is the newer correction, not the stale one',
  );
  assert.equal(withSecondSameSource[0].task_ref, 'req_2');

  const withDifferentTopic = mergeMemoryNotes(withSecondSameSource, {
    note: 'A separate, unrelated correction.',
    source: 'council_verdict',
    taskRef: 'req_3',
  });
  assert.equal(withDifferentTopic.length, 2, 'a genuinely different topic/source adds alongside, not over');
  assert.equal(withDifferentTopic[0].source, 'council_verdict', 'newest-first ordering');
}

// ---------- mergeMemoryNotes: hard caps (count + char budget) ----------

{
  let notes = [];
  for (let i = 0; i < 12; i += 1) {
    notes = mergeMemoryNotes(notes, {
      note: `Distinct correction number ${i} with enough padding text to matter for the char budget check here.`,
      source: `source-${i}`,
    });
  }
  assert.ok(notes.length <= MAX_MEMORY_NOTES, `never exceeds MAX_MEMORY_NOTES (${MAX_MEMORY_NOTES}), got ${notes.length}`);
  assert.ok(notes.length < 12, 'the char/count cap actually dropped some entries rather than keeping all 12');
  assert.ok(
    JSON.stringify(notes).length <= MAX_MEMORY_NOTES_CHARS,
    'serialized memory_notes stays within the char budget',
  );
  // The most recently recorded entry is never the one sacrificed to the cap.
  assert.equal(notes[0].source, 'source-11', 'newest entry always survives the cap');
}

// ---------- formatAgentMemoryBlock ----------

assert.equal(formatAgentMemoryBlock([]), '', 'no notes -> no block, never an empty labelled header');
assert.equal(formatAgentMemoryBlock(), '', 'undefined input is handled the same as empty');

{
  const block = formatAgentMemoryBlock([
    { source: 'done_tool', note: 'Always confirm the webhook secret before retrying.' },
  ]);
  assert.match(block, /Recent self-corrections/, 'labelled block');
  assert.ok(block.includes('webhook secret'), 'note content present');
  assert.ok(block.length <= MAX_MEMORY_NOTES_CHARS, 'stays within its own char cap');
}

// ---------- recordAgentMemory: stubbed Supabase client ----------

function makeStubClient({ initialConfig = {} } = {}) {
  let storedConfig = initialConfig;
  const patchCalls = [];
  return {
    client: {
      async sbSelect(table, filter) {
        assert.equal(table, 'axon_venture_agents');
        assert.match(filter, /^id=eq\.agent-123/);
        return [{ id: 'agent-123', config: storedConfig }];
      },
      async sbPatch(table, filter, row) {
        assert.equal(table, 'axon_venture_agents');
        assert.match(filter, /^id=eq\.agent-123/);
        storedConfig = row.config;
        patchCalls.push(row);
        return { id: 'agent-123', config: storedConfig };
      },
    },
    patchCalls,
    getConfig: () => storedConfig,
  };
}

{
  const stub = makeStubClient({ initialConfig: { instructions: 'Be helpful.' } });
  const result = await recordAgentMemory(
    'agent-123',
    { note: 'Retry the webhook check twice before failing over.', source: 'done_tool', taskRef: 'req_9' },
    { client: stub.client },
  );
  assert.equal(result.ok, true);
  assert.equal(stub.patchCalls.length, 1, 'exactly one write for one recordAgentMemory call');
  assert.equal(stub.getConfig().instructions, 'Be helpful.', 'existing config fields are preserved, not clobbered');
  assert.equal(stub.getConfig().memory_notes.length, 1);
  assert.ok(stub.getConfig().memory_notes[0].note.includes('webhook check'));
}

{
  // Supersede-in-place through the real write path, not just the pure merge function.
  const stub = makeStubClient({ initialConfig: {} });
  await recordAgentMemory('agent-123', { note: 'First pass note.', source: 'done_tool' }, { client: stub.client });
  await recordAgentMemory(
    'agent-123',
    { note: 'Corrected note replacing the first pass.', source: 'done_tool' },
    { client: stub.client },
  );
  assert.equal(stub.getConfig().memory_notes.length, 1, 'second write on the same source supersedes, not appends');
  assert.ok(stub.getConfig().memory_notes[0].note.includes('Corrected note'));
}

// ---------- recordAgentMemory: failure modes never throw ----------

{
  const result = await recordAgentMemory(null, { note: 'x', source: 'done_tool' }, { client: {} });
  assert.equal(result.ok, false);
  assert.match(result.reason, /agentId/);
}

{
  const result = await recordAgentMemory('agent-123', { note: '   ', source: 'done_tool' }, { client: {} });
  assert.equal(result.ok, false, 'blank note is rejected');
}

{
  // Isolated from any real SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY in the actual
  // process env (CI and local dev boxes both commonly have one set) — this case is
  // specifically "no key AND no client given", so the ambient env must not leak in.
  const savedKey = process.env.SUPABASE_SERVICE_KEY;
  const savedRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const result = await recordAgentMemory('agent-123', { note: 'x', source: 'done_tool' }, {});
    assert.equal(result.ok, false);
    assert.match(result.reason, /supabase key/);
  } finally {
    if (savedKey !== undefined) process.env.SUPABASE_SERVICE_KEY = savedKey;
    if (savedRoleKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedRoleKey;
  }
}

{
  const client = {
    async sbSelect() {
      throw new Error('network blip');
    },
  };
  const result = await recordAgentMemory('agent-123', { note: 'x', source: 'done_tool' }, { client });
  assert.equal(result.ok, false);
  assert.match(result.reason, /read failed/);
}

{
  const client = { async sbSelect() { return []; } };
  const result = await recordAgentMemory('missing-agent', { note: 'x', source: 'done_tool' }, { client });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no axon_venture_agents row/);
}

{
  const client = {
    async sbSelect() {
      return [{ id: 'agent-123', config: {} }];
    },
    async sbPatch() {
      throw new Error('write blip');
    },
  };
  const result = await recordAgentMemory('agent-123', { note: 'x', source: 'done_tool' }, { client });
  assert.equal(result.ok, false);
  assert.match(result.reason, /write failed/);
}

// ---------- boot-context surfacing: buildAgentBootContext actually includes the note ----------
//
// buildAgentBootContext() (lib/axon-agent-boot.mjs) has no injectable client — it always
// goes through lib/supabase.mjs's real fetch-based wrapper — so this proves the wiring
// the same way the rest of that module is proven: stub global fetch for the handful of
// PostgREST calls a boot makes, and assert on the resulting systemPrompt/meta. Restores
// the original fetch afterwards regardless of outcome.
{
  const { buildAgentBootContext } = await import('../lib/axon-agent-boot.mjs');

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_SERVICE_KEY = 'test-key-not-real';

  const persistedNote = 'Always check the FIRE gate before dispatching outreach.';

  globalThis.fetch = async (url) => {
    const u = String(url);
    const json = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (u.includes('/axon_venture_agents')) {
      return json([
        {
          id: 'agent-boot-test',
          name: 'Test Persona',
          role: 'tester',
          venture_id: 'v1',
          config: {
            instructions: 'Stay concise.',
            memory_notes: [{ source: 'done_tool', note: persistedNote, task_ref: 'req_1', recorded_at: 'now' }],
          },
        },
      ]);
    }
    // golden_skills, v_boot, nvg_agent_authority, session_notes_apartment, axon_wisdom_items —
    // all empty/absent for this test, none of them relevant to the assertion below.
    return json([]);
  };

  try {
    const { systemPrompt, meta } = await buildAgentBootContext('agent-boot-test');
    assert.match(systemPrompt, /Recent self-corrections/, 'boot context includes the memory block header');
    assert.ok(systemPrompt.includes(persistedNote), 'boot context surfaces the actual persisted note text');
    assert.equal(meta.memoryNoteCount, 1, 'meta reports how many memory notes were surfaced');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalKey;
  }
}

console.log('axon-agent-memory-writeback.test.mjs OK');
