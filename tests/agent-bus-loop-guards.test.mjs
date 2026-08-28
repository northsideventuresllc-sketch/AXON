#!/usr/bin/env node
/**
 * AXON Agent Bus — proves the loop guards that keep agent-to-agent fan-out from
 * turning into an unattended, money-burning loop. checkLoopGuards, parseToolCall
 * and validateToolCall are deliberately pure (no I/O) so this file is cheap and
 * needs no Supabase key to run. See tests/router-scoring.test.mjs for the sibling
 * pattern this follows.
 *
 * Run: node tests/agent-bus-loop-guards.test.mjs
 */
import assert from 'node:assert/strict';
import {
  checkLoopGuards,
  MAX_FANOUT_DEPTH,
  MAX_HOPS_PER_REQUEST,
  parseToolCall,
  validateToolCall,
  classifyGatedAction,
} from '../lib/axon-agent-bus.mjs';

// --- 1. depth within the allowed chain is fine -----------------------------------------
{
  const r = checkLoopGuards({ depth: MAX_FANOUT_DEPTH, hopCount: 0, chain: ['a'], fromAgentId: 'a', toAgentId: 'b' });
  assert.equal(r.allowed, true, 'depth exactly at MAX_FANOUT_DEPTH must still be allowed');
}

// --- 2. depth one past the max is refused -----------------------------------------------
{
  const r = checkLoopGuards({ depth: MAX_FANOUT_DEPTH + 1, hopCount: 0, chain: ['a'], fromAgentId: 'a', toAgentId: 'b' });
  assert.equal(r.allowed, false, 'depth past MAX_FANOUT_DEPTH must be refused');
  assert.match(r.reason, /fan-out depth/);
}

// --- 3. hop count at the ceiling is refused, one below it is fine -----------------------
{
  const atCeiling = checkLoopGuards({ depth: 1, hopCount: MAX_HOPS_PER_REQUEST, chain: [], fromAgentId: 'a', toAgentId: 'b' });
  assert.equal(atCeiling.allowed, false, 'hop count at the ceiling must be refused');
  assert.match(atCeiling.reason, /hop count/);

  const belowCeiling = checkLoopGuards({
    depth: 1,
    hopCount: MAX_HOPS_PER_REQUEST - 1,
    chain: [],
    fromAgentId: 'a',
    toAgentId: 'b',
  });
  assert.equal(belowCeiling.allowed, true, 'one hop below the ceiling must still be allowed');
}

// --- 4. an agent already in the chain is refused (cycle guard) --------------------------
{
  const r = checkLoopGuards({ depth: 1, hopCount: 0, chain: ['a', 'b'], fromAgentId: 'b', toAgentId: 'a' });
  assert.equal(r.allowed, false, 'firing an agent already in the chain must be refused');
  assert.match(r.reason, /chain/);
}

// --- 5. an agent cannot fire itself ------------------------------------------------------
{
  const r = checkLoopGuards({ depth: 1, hopCount: 0, chain: [], fromAgentId: 'a', toAgentId: 'a' });
  assert.equal(r.allowed, false, 'self-fire must be refused');
  assert.match(r.reason, /fire itself/);
}

// --- 6. a missing target id is refused, not silently coerced ----------------------------
{
  const r = checkLoopGuards({ depth: 1, hopCount: 0, chain: [], fromAgentId: 'a', toAgentId: '' });
  assert.equal(r.allowed, false, 'an empty toAgentId must be refused');
}

// --- 7. a two-hop chain (agent -> subagent -> subagent) is exactly what depth=2 allows --
{
  // root (depth 0) fires its first subagent: resulting depth 1
  const hop1 = checkLoopGuards({ depth: 1, hopCount: 0, chain: [], fromAgentId: 'root', toAgentId: 'sub1' });
  assert.equal(hop1.allowed, true);
  // sub1 fires its own subagent: resulting depth 2 — still allowed
  const hop2 = checkLoopGuards({ depth: 2, hopCount: 1, chain: ['root'], fromAgentId: 'sub1', toAgentId: 'sub2' });
  assert.equal(hop2.allowed, true);
  // sub2 tries to fire a third generation: resulting depth 3 — refused
  const hop3 = checkLoopGuards({ depth: 3, hopCount: 2, chain: ['root', 'sub1'], fromAgentId: 'sub2', toAgentId: 'sub3' });
  assert.equal(hop3.allowed, false, 'a third generation of fan-out must be refused');
}

// --- 8. tool-call parsing: unknown tool name is ignored safely ---------------------------
{
  const call = parseToolCall('```tool\n{"tool": "delete_everything", "toAgentId": "x"}\n```');
  assert.ok(call, 'a well-formed JSON block still parses');
  const check = validateToolCall(call);
  assert.equal(check.valid, false, 'an unknown tool name must fail validation');
}

// --- 9. tool-call parsing: malformed JSON is ignored safely, never throws ----------------
{
  assert.doesNotThrow(() => parseToolCall('```tool\n{not valid json at all\n```'));
  const call = parseToolCall('```tool\n{not valid json at all\n```');
  assert.equal(call, null, 'malformed JSON must come back as no tool call, not an error');
}

// --- 10. tool-call parsing: fire_agent missing required fields is refused ---------------
{
  const call = parseToolCall('{"tool": "fire_agent"}');
  const check = validateToolCall(call);
  assert.equal(check.valid, false, 'fire_agent without toAgentId/task must fail validation');
}

// --- 11. tool-call parsing: a valid fire_agent block passes -----------------------------
{
  const call = parseToolCall('Doing it now.\n```tool\n{"tool": "fire_agent", "toAgentId": "abc-123", "task": "check the deploy"}\n```');
  const check = validateToolCall(call);
  assert.equal(check.valid, true);
  assert.equal(call.toAgentId, 'abc-123');
}

// --- 12. plain prose with no tool block returns null, never a false positive ------------
{
  assert.equal(parseToolCall('Just a normal reply with no tool call in it.'), null);
}

// --- 13. gated-action classification only fires on the keywords it is meant to ----------
{
  assert.equal(classifyGatedAction('send this outreach email to the lead'), 'outreach.run');
  assert.equal(classifyGatedAction('publish this post now'), 'content.publish');
  assert.equal(classifyGatedAction('just say hello back'), null);
}

console.log('agent-bus-loop-guards: all 13 checks passed');
