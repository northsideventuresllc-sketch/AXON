// Proves lib/agent-names.mjs holds the canonical agent_bus names AXON's
// GitHub-Actions scripts had drifted away from (see nvg_agent_routines.agent_name).
import assert from 'node:assert/strict';
import { AGENT } from '../lib/agent-names.mjs';

const expected = {
  SEO_TRACKER: 'AXON-SEO-Tracker',
  SOCIAL_MEDIA_RESEARCH: 'AXON-Social-Media-Research',
  TRAINING_INGEST: 'AXON-Training-Ingest',
  SELF_RESEARCH: 'AXON-Self-Research',
  COMPETITOR_SCAN: 'AXON-Competitor-Scan',
  REGISTRY_CHECK: 'AXON-ARCEUS Registry Check',
  EXECUTIVE_AGENT: 'AXON Executive Agent',
};

for (const [key, value] of Object.entries(expected)) {
  assert.equal(AGENT[key], value, `AGENT.${key} should be canonical`);
}

// The object is frozen — a call site can never accidentally drift it again.
assert.throws(() => {
  AGENT.SEO_TRACKER = 'something-else';
}, /Cannot assign|read only|read-only/i);

console.log('agent-names.test.mjs passed');
