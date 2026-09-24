/**
 * LOCAL-FIRST (Decision #2001): the chain's local tier picks the task-specialized small model
 * only when the live installed list has it; else axon-ornith; else any installed AXON model.
 * Every relay_metric row names the model that served (or was last tried), plus the intent.
 *
 * Run: node tests/local-first-intent.test.mjs
 */
import assert from 'node:assert/strict';
import {
  classifyIntent,
  resolveLocalIntent,
  specializedModelFor,
  pickLocalModelCandidates,
} from '../lib/axon-local-intent.mjs';
import { axonGenerate, __resetOllamaWarmThrottle, localMetricFields } from '../lib/axon-router-core.mjs';
import { __resetModelDiscoveryCache } from '../lib/axon-model-discovery.mjs';

const ENV = {}; // no overrides → built-in defaults
const ALL = ['axon-llama:canary', 'axon-ornith:canary', 'qwen2.5-coder:1.5b', 'deepseek-r1:1.5b', 'qwen2.5:0.5b', 'ornith:9b', 'axon-ornith:latest', 'axon-llama:latest'];

// --- 1. intent classification ----------------------------------------------------------------
assert.equal(classifyIntent('Return the result as JSON with keys a and b'), 'extraction');
assert.equal(classifyIntent('fix this: ```const x = 1```'), 'code');
assert.equal(classifyIntent('Write a SELECT id FROM users query'), 'code');
assert.equal(classifyIntent('Compare these two plans and explain the trade-offs'), 'reasoning');
assert.equal(classifyIntent('Write a friendly hello to a new coach'), 'general');
assert.equal(resolveLocalIntent('council_review', 'hello'), 'reasoning', 'explicit kind beats prompt');
assert.equal(resolveLocalIntent('sql_fix', 'hello'), 'code');
assert.equal(resolveLocalIntent('json_extract', 'hello'), 'extraction');
assert.equal(resolveLocalIntent('cheap_chat', 'parse this into json'), 'extraction', 'generic kind → prompt heuristic');
assert.equal(resolveLocalIntent(null, 'say hi'), 'general');

// --- 2. specialized model per intent (+ env override) ----------------------------------------
assert.equal(specializedModelFor('code', ENV), 'qwen2.5-coder:1.5b');
assert.equal(specializedModelFor('reasoning', ENV), 'deepseek-r1:1.5b');
assert.equal(specializedModelFor('extraction', ENV), 'qwen2.5:0.5b');
assert.equal(specializedModelFor('general', ENV), null);
assert.equal(specializedModelFor('code', { AXON_CODE_MODEL: 'my-coder:3b' }), 'my-coder:3b');

// --- 3. each intent route with the real (2026-09-24) installed list --------------------------
for (const [intent, want] of [['code', 'qwen2.5-coder:1.5b'], ['reasoning', 'deepseek-r1:1.5b'], ['extraction', 'qwen2.5:0.5b']]) {
  const p = pickLocalModelCandidates({ intent, installed: ALL, configured: ['axon-ornith:latest'], env: ENV });
  assert.equal(p.candidates[0], want, `${intent} → ${want} first`);
  assert.equal(p.candidates[1], 'axon-ornith:latest', `${intent} → axon-ornith second`);
  assert.equal(p.reason, 'specialized');
  assert.equal(p.specialized, want);
}
{
  const p = pickLocalModelCandidates({ intent: 'general', installed: ALL, configured: [], env: ENV });
  assert.equal(p.candidates[0], 'axon-ornith:latest', 'general → axon-ornith');
  assert.equal(p.reason, 'general');
}

// --- 4. fallbacks ----------------------------------------------------------------------------
{
  // specialized not installed → axon-ornith first, never the missing model
  const p = pickLocalModelCandidates({ intent: 'code', installed: ['axon-ornith:latest', 'qwen2.5:0.5b'], env: ENV });
  assert.ok(!p.candidates.includes('qwen2.5-coder:1.5b'));
  assert.equal(p.candidates[0], 'axon-ornith:latest');
  assert.equal(p.reason, 'specialized_not_installed');
}
{
  // no axon-ornith either → any installed AXON model before non-AXON ones
  const p = pickLocalModelCandidates({ intent: 'reasoning', installed: ['ornith:9b', 'axon-llama:latest'], env: ENV });
  assert.deepEqual(p.candidates, ['axon-llama:latest', 'ornith:9b']);
}
{
  // installed list unknown → old behaviour: configured pins only, never a specialized gamble
  const p = pickLocalModelCandidates({ intent: 'code', installed: null, configured: ['axon-ornith:latest'], env: ENV });
  assert.deepEqual(p.candidates, ['axon-ornith:latest']);
  assert.equal(p.reason, 'installed_unknown');
  const q = pickLocalModelCandidates({ intent: 'code', installed: null, configured: [], env: ENV });
  assert.deepEqual(q.candidates, ['axon-ornith:latest']);
}
{
  // `name` vs `name:latest` are the same Ollama model
  const p = pickLocalModelCandidates({ intent: 'general', installed: ['axon-ornith'], env: ENV });
  assert.equal(p.candidates[0], 'axon-ornith');
}
assert.deepEqual(localMetricFields(null), {});
assert.deepEqual(localMetricFields({ intent: 'code', pickReason: 'specialized', specialized: 'q' }), { intent: 'code', pick_reason: 'specialized', specialized_model: 'q' });

// --- 5. end to end through axonGenerate: installed list read from the latest tags job --------
function json(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}
const originalFetch = globalThis.fetch;

function mock({ tagsStdout, generateReply = (m) => JSON.stringify({ response: `hi from ${m}` }) }) {
  const generated = [];
  const metrics = [];
  const tagProbes = [];
  let jobId = 0;
  const jobs = new Map();
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (u.includes('/rest/v1/axon_llm_chain')) return json([{ tier: 'local', position: 0, enabled: true }, { tier: 'gemini', position: 1, enabled: true }]);
    if (u.includes('/rest/v1/router_routes') && u.includes('ollama-local')) return json([{ id: 'r-local', name: 'ollama-local', base_url: 'http://localhost:11434', enabled: true }]);
    if (u.includes('/rest/v1/router_routes')) return json([]);
    if (u.includes('/rest/v1/router_models')) return json([{ model: 'axon-ornith:latest', cost_tier: 0, priority: 1 }]);
    if (u.includes('axon_model_catalog')) return json({}, 404);
    if (u.includes('/rest/v1/nvg_mini_jobs') && u.includes('title=eq.axon-ollama-tags')) {
      return json(tagsStdout ? [{ result: { stdout: tagsStdout }, created_at: new Date().toISOString() }] : []);
    }
    if (u.includes('/rest/v1/nvg_mini_jobs') && opts.method === 'POST') {
      const row = Array.isArray(body) ? body[0] : body;
      if (row.kind === 'relay_metric') {
        metrics.push(row.payload);
        return json([]);
      }
      if (row.status === 'queued') {
        jobId += 1;
        const cmd = row.payload.cmd;
        let stdout;
        if (cmd.endsWith('/api/tags')) {
          tagProbes.push(cmd);
          stdout = JSON.stringify({ models: ALL.map((name) => ({ name })) });
        } else {
          const sent = JSON.parse(cmd.split(" -d '")[1].slice(0, -1).replace(/'\\''/g, "'"));
          generated.push(sent.model);
          stdout = generateReply(sent.model);
        }
        jobs.set(jobId, stdout);
        return json([{ id: jobId }]);
      }
      return json([]);
    }
    if (u.includes('/rest/v1/nvg_mini_jobs')) {
      const id = Number(new URL(u).searchParams.get('id')?.replace('eq.', ''));
      return json([{ status: 'done', result: { stdout: jobs.get(id) } }]);
    }
    return json([]);
  };
  return { fetchImpl, generated, metrics, tagProbes };
}

const TAGS = JSON.stringify({ models: ALL.map((name) => ({ name })) });

{
  // code prompt + installed list known → coder model serves; metric names it
  __resetModelDiscoveryCache();
  __resetOllamaWarmThrottle();
  const m = mock({ tagsStdout: TAGS });
  globalThis.fetch = m.fetchImpl;
  const out = await axonGenerate('k', { system: 's', user: 'refactor: ```const a = 1```', agentName: 't', kind: 'cheap_chat' });
  globalThis.fetch = originalFetch;
  assert.deepEqual(m.generated, ['qwen2.5-coder:1.5b']);
  assert.equal(out.provider, 'local');
  assert.equal(out.model, 'qwen2.5-coder:1.5b');
  const metric = m.metrics.find((p) => p.tier === 'local');
  assert.equal(metric.model, 'qwen2.5-coder:1.5b');
  assert.equal(metric.intent, 'code');
  assert.equal(metric.pick_reason, 'specialized');
  assert.equal(metric.success, true);
  assert.equal(m.tagProbes.length, 0, 'known list → no extra mini probe');
}
{
  // reasoning via explicit kind
  __resetModelDiscoveryCache();
  __resetOllamaWarmThrottle();
  const m = mock({ tagsStdout: TAGS });
  globalThis.fetch = m.fetchImpl;
  const out = await axonGenerate('k', { system: 's', user: 'hello', agentName: 't', kind: 'council_review' });
  globalThis.fetch = originalFetch;
  assert.equal(out.model, 'deepseek-r1:1.5b');
}
{
  // installed list unknown → axon-ornith serves (no gamble), one background probe is fired
  __resetModelDiscoveryCache();
  __resetOllamaWarmThrottle();
  const m = mock({ tagsStdout: null });
  globalThis.fetch = m.fetchImpl;
  const out = await axonGenerate('k', { system: 's', user: 'return JSON with keys a, b', agentName: 't', kind: 'cheap_chat' });
  await new Promise((r) => setTimeout(r, 20));
  globalThis.fetch = originalFetch;
  assert.deepEqual(m.generated, ['axon-ornith:latest']);
  assert.equal(out.model, 'axon-ornith:latest');
  const metric = m.metrics.find((p) => p.tier === 'local');
  assert.equal(metric.pick_reason, 'installed_unknown');
  assert.equal(metric.model, 'axon-ornith:latest');
  assert.equal(m.tagProbes.length, 1, 'one warm-up probe so the next call can specialize');
}
{
  // specialized model listed but missing at call time → refresh + fall back to axon-ornith
  __resetModelDiscoveryCache();
  __resetOllamaWarmThrottle();
  const m = mock({
    tagsStdout: TAGS,
    generateReply: (model) => (model === 'deepseek-r1:1.5b'
      ? JSON.stringify({ error: `model "${model}" not found, try pulling it first` })
      : JSON.stringify({ response: `hi from ${model}` })),
  });
  globalThis.fetch = m.fetchImpl;
  const out = await axonGenerate('k', { system: 's', user: 'analyze the pros and cons', agentName: 't', kind: 'cheap_chat' });
  globalThis.fetch = originalFetch;
  assert.equal(m.generated[0], 'deepseek-r1:1.5b');
  assert.equal(out.model, m.generated[m.generated.length - 1]);
  assert.equal(out.model, 'axon-ornith:latest');
}
{
  // local failure (no stdout) → failure metric names the model that was tried
  __resetModelDiscoveryCache();
  __resetOllamaWarmThrottle();
  const m = mock({ tagsStdout: TAGS, generateReply: () => '' });
  globalThis.fetch = m.fetchImpl;
  await axonGenerate('k', { system: 's', user: 'const x = 1; fix it', agentName: 't', kind: 'cheap_chat' }).catch(() => {});
  globalThis.fetch = originalFetch;
  const metric = m.metrics.find((p) => p.tier === 'local');
  assert.equal(metric.success, false);
  assert.equal(metric.model, 'qwen2.5-coder:1.5b');
  assert.equal(metric.intent, 'code');
}

console.log('local-first-intent.test.mjs: all assertions passed');
