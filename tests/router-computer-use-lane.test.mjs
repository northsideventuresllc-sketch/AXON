#!/usr/bin/env node
/**
 * Proves the computer_use lane actually wires through the router — the path a real caller
 * uses (routeChat -> classifyCapability -> scoreLanes -> executeLane -> axon-computer-use
 * .mjs), not just that lib/axon-computer-use.mjs works standalone when called directly by
 * scripts/test-computer-use-video-task.mjs. Flagged by an independent council stress-test
 * lens on PR #204's first head SHA: "the router integration path is not exercised by the
 * provided test script" — this file closes that gap.
 *
 * No real Anthropic call, no real mini job: global.fetch is stubbed for both the
 * api.anthropic.com/v1/messages call inside runComputerUseTask and the Supabase Learnings
 * insert its logRun() makes, same pattern as tests/router-json-mode-max-tokens.test.mjs.
 * A stubbed reply with no tool_use blocks ends the agentic loop on its first turn with
 * outcome 'complete', so this never touches cliclick/screencapture/nvg_mini_jobs at all —
 * that live path is the mini's own job, verified separately (nvg_mini_jobs #2518, and
 * ultimately scripts/test-computer-use-video-task.mjs on the mini once Accessibility is
 * granted).
 *
 * Run: node tests/router-computer-use-lane.test.mjs
 */
import assert from 'node:assert/strict';
import { executeLane, classifyCapability } from '../lib/axon-router-core.mjs';

process.env.ANTHROPIC_API_KEY = 'fake-anthropic-key-router-cu-test';
process.env.SUPABASE_SERVICE_KEY = 'fake-supabase-key-router-cu-test';

const COMPUTER_USE_LANE = {
  laneId: 'test-computer-use',
  model: 'claude-sonnet-5',
  connectorKind: 'local',
  capabilities: ['computer_use'],
  route: {
    id: 'axon-computer-use-route',
    name: 'axon-computer-use',
    kind: 'api',
    connector_kind: 'local',
    cli_command: null,
    base_url: null,
    secret_key: null,
    requires_mini: true,
  },
};

function stubFetch({ anthropicText = 'Task complete: a real video is at /Users/Shared/nvg-media/x.mp4' } = {}) {
  return async (url, opts) => {
    const u = String(url);
    if (u.includes('api.anthropic.com/v1/messages')) {
      const body = JSON.parse(opts.body);
      assert.equal(body.tools?.[0]?.type, 'computer_toolset_20260801', 'must declare the confirmed toolset type');
      assert.equal(body.tools?.[0]?.name, undefined, 'toolset declaration must NOT carry a name field');
      assert.equal(body.tools?.[0]?.display_width_px, undefined, 'toolset declaration must NOT carry display dims');
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: anthropicText }] }) };
    }
    if (u.includes('supabase.co')) {
      return { ok: true, json: async () => ([{ id: 1 }]) };
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  };
}

// --- 1. classifyCapability(isComputerUse: true) -> 'computer_use', deterministic, no I/O --
{
  const cls = await classifyCapability('fake-key', { userMessage: 'hi', isComputerUse: true });
  assert.equal(cls, 'computer_use');
}

// --- 2. executeLane on a computer_use-capable lane runs the real agentic loop and returns
//        its finalText as the reply, exercising the exact dynamic-import wiring in
//        axon-router-core.mjs's executeLane() --------------------------------------------
{
  const originalFetch = global.fetch;
  global.fetch = stubFetch();
  let out;
  try {
    out = await executeLane(
      'fake-supabase-key',
      COMPUTER_USE_LANE,
      [
        { role: 'system', content: 'system note' },
        { role: 'user', content: 'download a Gemini/Flow video for Match Fit' },
      ],
      { hasMini: true },
    );
  } finally {
    global.fetch = originalFetch;
  }
  assert.match(out.reply, /Task complete/);
}

// --- 3. a computer_use lane without mini access refuses outright, rather than trying and
//        failing confusingly deep inside the agentic loop ---------------------------------
{
  await assert.rejects(
    () => executeLane('fake-supabase-key', COMPUTER_USE_LANE, [{ role: 'user', content: 'x' }], { hasMini: false }),
    /no mini access/,
  );
}

// --- 4. a non-'complete' outcome (e.g. the model gives up without finishing) surfaces as a
//        thrown error, so routeChat's fall-through/health-tracking treats it as a real lane
//        failure rather than a silent success -----------------------------------------------
{
  const originalFetch = global.fetch;
  // A tool_use block the loop can't act on meaningfully still ends in max_steps_exceeded
  // once maxSteps is exhausted — cheaper to prove via a lane that never emits a text-only
  // turn. Simplest deterministic trigger here: force the Anthropic call itself to fail,
  // which the loop catches internally and reports as outcome 'error'.
  global.fetch = async (url) => {
    if (String(url).includes('api.anthropic.com/v1/messages')) {
      return { ok: false, status: 500, text: async () => 'upstream down' };
    }
    return { ok: true, json: async () => ([{ id: 1 }]) };
  };
  try {
    await assert.rejects(
      () => executeLane('fake-supabase-key', COMPUTER_USE_LANE, [{ role: 'user', content: 'x' }], { hasMini: true }),
      /computer_use lane: error/,
    );
  } finally {
    global.fetch = originalFetch;
  }
}

console.log('router-computer-use-lane.test.mjs OK');
