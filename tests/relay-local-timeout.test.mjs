#!/usr/bin/env node
/**
 * AXON-MODEL-FRONTIER-SESSION-0925 (folded 13ef52ba, "local Ollama relay timeouts 34/68
 * failing with AbortError"): unit coverage for the per-model/prompt-size tuned timeout,
 * separate from tests/relay-timeout-runtime.test.mjs (which proves the value actually
 * reaches queueMiniShellJob at runtime). This file proves the formula itself.
 *
 * Run: node tests/relay-local-timeout.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeLocalTimeoutS,
  computeLocalMaxWaitMs,
  localModelSizeB,
  buildLocalGenerateCmd,
} from '../lib/axon-router-core.mjs';

test('localModelSizeB: known custom tags', () => {
  assert.equal(localModelSizeB('axon-ornith'), 9);
  assert.equal(localModelSizeB('axon-ornith:latest'), 9);
  assert.equal(localModelSizeB('axon-llama'), 3.2);
});

test('localModelSizeB: parses a :<n>b suffix off a base Ollama tag', () => {
  assert.equal(localModelSizeB('qwen2.5:0.5b'), 0.5);
  assert.equal(localModelSizeB('llama3:70b'), 70);
});

test('localModelSizeB: unknown tag returns null (never guessed silently)', () => {
  assert.equal(localModelSizeB('some-brand-new-model'), null);
  assert.equal(localModelSizeB(''), null);
  assert.equal(localModelSizeB(undefined), null);
});

test('computeLocalTimeoutS: a small warm model with a short prompt gets close to the floor', () => {
  const t = computeLocalTimeoutS('qwen2.5:0.5b', 20);
  assert.ok(t >= 45 && t <= 75, `expected qwen2.5:0.5b/short prompt near the floor, got ${t}s`);
});

test('computeLocalTimeoutS: a large cold-load-prone model gets meaningfully more time than a small one', () => {
  const small = computeLocalTimeoutS('qwen2.5:0.5b', 20);
  const big = computeLocalTimeoutS('axon-ornith', 20);
  assert.ok(big > small, `axon-ornith (${big}s) should get more time than qwen2.5:0.5b (${small}s)`);
  // This is the exact regression the ticket named: the OLD flat constant was 120s for
  // every model. axon-ornith (9B, frequently cold) must now clear that on its own merit,
  // not because every call got a flat 120s whether it needed it or not.
  assert.ok(big >= 100, `axon-ornith's tuned timeout (${big}s) should be a real cold-load allowance, not a token bump`);
});

test('computeLocalTimeoutS: an unknown model tag is treated as worst-case size, not undersized', () => {
  const unknown = computeLocalTimeoutS('brand-new-local-model', 20);
  const ornith = computeLocalTimeoutS('axon-ornith', 20);
  assert.equal(unknown, ornith, 'an unknown-size model must get at least as much time as a known 9B model, never less');
});

test('computeLocalTimeoutS: a long prompt gets extra time on top of the model-size allowance, capped', () => {
  const short = computeLocalTimeoutS('axon-ornith', 100);
  const long = computeLocalTimeoutS('axon-ornith', 50_000);
  assert.ok(long > short, `a 50k-char prompt (${long}s) should get more time than a 100-char one (${short}s)`);
  const veryLong = computeLocalTimeoutS('axon-ornith', 5_000_000);
  assert.ok(veryLong <= 240, `the cap must hold even for an extreme prompt length, got ${veryLong}s`);
});

test('computeLocalTimeoutS: never returns below the 45s floor or above the 240s cap', () => {
  for (const [model, len] of [['qwen2.5:0.5b', 0], ['axon-ornith', 0], ['llama3:70b', 1_000_000]]) {
    const t = computeLocalTimeoutS(model, len);
    assert.ok(t >= 45 && t <= 240, `computeLocalTimeoutS(${model}, ${len}) = ${t}s out of [45,240] bounds`);
  }
});

test('computeLocalMaxWaitMs: always exceeds computeLocalTimeoutS in ms by a fixed buffer (AX-RELAY-TIMEOUT-FIX-0828 pairing rule)', () => {
  for (const [model, len] of [['qwen2.5:0.5b', 20], ['axon-ornith', 20], ['axon-ornith', 20_000]]) {
    const timeoutS = computeLocalTimeoutS(model, len);
    const maxWaitMs = computeLocalMaxWaitMs(model, len);
    assert.equal(maxWaitMs, timeoutS * 1000 + 10_000, `maxWaitMs for ${model} must be timeoutS*1000 + 10s buffer`);
    assert.ok(maxWaitMs > timeoutS * 1000, 'the poll budget must always exceed the curl timeout it is paired with');
  }
});

test('buildLocalGenerateCmd: curl -m value matches computeLocalTimeoutS for the same model/prompt', () => {
  const prompt = 'a'.repeat(500);
  const cmd = buildLocalGenerateCmd('http://localhost:11434', 'axon-ornith', prompt);
  const expected = computeLocalTimeoutS('axon-ornith', prompt.length);
  assert.match(cmd, new RegExp(`^curl -s -m ${expected} `), `curl -m must equal computeLocalTimeoutS('axon-ornith', ${prompt.length}) = ${expected}`);
});
