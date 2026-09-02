// Proves lib/slack-post.mjs's header builder matches the locked "Agent Comms —
// Talk, Slack, Fire" (2026-09-02) format: every #agent-ops post must START
// with a bold header line `*<canonical agent_name> — <one line what happened>*`.
import assert from 'node:assert/strict';
import { buildAgentOpsHeader, postAgentOps } from '../lib/slack-post.mjs';
import { AGENT } from '../lib/agent-names.mjs';

// --- header format -----------------------------------------------------
{
  const header = buildAgentOpsHeader(AGENT.SEO_TRACKER, 'ran clean, 3 findings');
  assert.equal(header, '*AXON-SEO-Tracker — ran clean, 3 findings*');
  assert.ok(header.startsWith('*'), 'header must start with the bold marker');
  assert.ok(header.endsWith('*'), 'header must end with the bold marker');
}

// --- postAgentOps composes header + body and posts to the edge function ----
{
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200 };
  };
  try {
    const result = await postAgentOps({
      agentName: AGENT.EXECUTIVE_AGENT,
      headline: 'nightly run 2026-09-02',
      body: '• Wisdom: ok',
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('/functions/v1/slack-post'));
    const sentBody = JSON.parse(calls[0].opts.body);
    assert.equal(sentBody.channel, 'C0BQMTYMNRH');
    assert.ok(sentBody.text.startsWith('*AXON Executive Agent — nightly run 2026-09-02*'));
    assert.ok(sentBody.text.includes('• Wisdom: ok'));
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- headline-only post has no trailing separator ---------------------
{
  const realFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, opts) => {
    sent = JSON.parse(opts.body);
    return { ok: true, status: 200 };
  };
  try {
    await postAgentOps({ agentName: AGENT.SEO_TRACKER, headline: 'all clear' });
    assert.equal(sent.text, '*AXON-SEO-Tracker — all clear*');
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log('slack-post-header.test.mjs passed');
