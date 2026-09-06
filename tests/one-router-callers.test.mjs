#!/usr/bin/env node
/**
 * ONE ROUTER (2026-09-06) — proves every rewired text-generation caller goes
 * through the router instead of its own provider waterfall, and that each one
 * keeps the raw/no-model fallback it had before.
 *
 * Two kinds of proof here:
 *   1. Dependency injection — each caller takes a `generate` seam defaulting to
 *      generateViaRouter, so a stub proves the call is made with the caller's own
 *      system prompt and the supabase key it holds, with zero network.
 *   2. One end-to-end pass (last block) with a mocked fetch, proving the real
 *      default path walks the locked chain and stops at the first free lane that
 *      answers — never reaching the paid one.
 *
 * Offline: no network, no env secrets.
 *
 * Run: node --test tests/one-router-callers.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { scanProspect, haikuScoreAndDraft, haikuFollowUp } from '../lib/ai.mjs';
import { axonChatReply } from '../lib/axon-telegram-chat.mjs';
import { synthesizeFinding } from '../lib/axon-research-synthesis.mjs';
import { synthesizeFindings } from '../lib/axon-research-core.mjs';
import { synthesizeArea } from '../lib/axon-self-research-build-plans.mjs';
import { polishWisdomTiered } from '../lib/wisdom-absorb-loop.mjs';
import { laneSource } from '../lib/axon-generate.mjs';

const CFG = { supabaseKey: 'test-service-key' };
const PROSPECT = { title: 'Acme Freight | Logistics', snippet: 'Ops bottleneck', link: 'https://acme.test' };

/** A stub standing in for generateViaRouter: records the call, returns canned text. */
function stubGenerate(text, lane = 'openrouter') {
  const calls = [];
  const fn = async (supabaseKey, opts) => {
    calls.push({ supabaseKey, opts });
    return { text, provider: lane, model: 'test-model', source: laneSource(lane) };
  };
  fn.calls = calls;
  return fn;
}

/** A stub whose chain is entirely down. */
function failingGenerate() {
  const calls = [];
  const fn = async (supabaseKey, opts) => {
    calls.push({ supabaseKey, opts });
    throw new Error('every tier in the chain failed or was unconfigured');
  };
  fn.calls = calls;
  return fn;
}

test('lane tags map back to the source names callers already returned', () => {
  assert.equal(laneSource('local'), 'axon-local');
  assert.equal(laneSource('runpod'), 'axon-v1-runpod');
  assert.equal(laneSource('gemini'), 'gemini');
  assert.equal(laneSource('anthropic'), 'anthropic');
  assert.equal(laneSource(undefined), 'router');
});

test('prospect scan goes through the router and tags the lane that answered', async () => {
  const gen = stubGenerate(JSON.stringify({ company: 'Acme Freight', icp_fit: true }), 'gemini');
  const scan = await scanProspect(CFG, PROSPECT, gen);

  assert.equal(gen.calls.length, 1, 'exactly one router call');
  assert.equal(gen.calls[0].supabaseKey, 'test-service-key', 'the caller hands the router its service key');
  assert.match(gen.calls[0].opts.user, /Acme Freight/, 'the scan prompt is preserved');
  assert.equal(scan.company, 'Acme Freight');
  assert.equal(scan._scan_source, 'gemini');
  assert.equal(scan._scan_model, 'test-model');
});

test('prospect scan still falls back to search metadata when the whole chain is down', async () => {
  const gen = failingGenerate();
  const scan = await scanProspect(CFG, PROSPECT, gen);

  assert.equal(gen.calls.length, 1);
  assert.equal(scan._scan_source, 'serp_fallback', 'no model, but outreach can still queue a draft');
  assert.equal(scan.company, 'Acme Freight');
});

test('outreach score/draft and follow-up both go through the router', async () => {
  const draftGen = stubGenerate(JSON.stringify({ score: 82, channel: 'email' }));
  const draft = await haikuScoreAndDraft(CFG, { company: 'Acme' }, PROSPECT, '', draftGen);
  assert.equal(draft.score, 82);
  assert.equal(draftGen.calls.length, 1);
  assert.match(draftGen.calls[0].opts.system, /B2B outreach engine/, 'system prompt unchanged');

  const followGen = stubGenerate(JSON.stringify({ email_subject: 'Follow up', email_body: 'Still here.' }));
  const follow = await haikuFollowUp(CFG, { handle: 'Acme', niche: 'freight', comment_draft: 'hi' }, followGen);
  assert.equal(follow.email_subject, 'Follow up');
  assert.equal(followGen.calls.length, 1);
  assert.equal(followGen.calls[0].supabaseKey, 'test-service-key');
});

test('the Telegram assistant replies through the router, prompt and trim intact', async () => {
  const gen = stubGenerate('Three drafts are waiting.');
  const reply = await axonChatReply(CFG, {
    userMessage: 'how many drafts are waiting?',
    history: [{ role: 'assistant', content: 'earlier turn' }],
    pipelineContext: 'Total leads: 4',
    generate: gen,
  });

  assert.equal(reply, 'Three drafts are waiting.');
  assert.equal(gen.calls.length, 1);
  const msgs = gen.calls[0].opts.messages;
  assert.equal(msgs[0].role, 'system');
  assert.match(msgs[0].content, /You are AXON/, 'the assistant keeps its own system prompt');
  assert.match(msgs.at(-1).content, /Total leads: 4/, 'pipeline snapshot still reaches the model');
});

// GROUNDED (2026-09-06): the old blanket fleet-ops redirect is gone — JB's chat
// is AXON's own voice now and fleet health is read live into the context, so a
// question about another agent is answered from that snapshot instead of being
// turned away. Grounding is enforced by the system prompt plus the deterministic
// routes in lib/axon-jb-chat.mjs (tests/telegram-chat-grounded.test.mjs).
test('a fleet question reaches the router with the grounding rules attached', async () => {
  const gen = stubGenerate('SENSEI is the only one flagged.');
  const reply = await axonChatReply(CFG, {
    userMessage: 'is ARCEUS running?',
    context: 'FLEET HEALTH — agents not reporting healthy:\n(nothing)',
    generate: gen,
  });
  assert.equal(reply, 'SENSEI is the only one flagged.');
  assert.equal(gen.calls.length, 1);
  assert.match(gen.calls[0].opts.messages[0].content, /I don't have that in front of me/);
});

test('content research synthesis routes, and keeps its raw-results fallback', async () => {
  const gen = stubGenerate('One clear finding.', 'local');
  const ok = await synthesizeFinding(CFG, { system: 'sys', prompt: 'p', rawResults: [] }, gen);
  assert.deepEqual(ok, { text: 'One clear finding.', source: 'axon-local' });

  const down = await synthesizeFinding(
    CFG,
    { system: 'sys', prompt: 'p', rawResults: [{ title: 'Real result', snippet: 'real' }] },
    failingGenerate(),
  );
  assert.equal(down.source, 'raw_serp_fallback');
  assert.match(down.text, /Real result/, 'the fallback is real search data, never invented');
});

test('research findings synthesis routes, and falls back to the heuristic gather', async () => {
  const gen = stubGenerate(JSON.stringify({ findings: [{ title: 'A finding' }] }), 'gemini');
  const out = await synthesizeFindings({
    supabaseKey: 'test-service-key',
    lane: 'ai_models',
    sources: [{ title: 'src', link: 'https://x.test' }],
    generate: gen,
  });
  assert.equal(out._provider, 'gemini');
  assert.equal(out.findings[0].title, 'A finding');
  assert.equal(gen.calls[0].supabaseKey, 'test-service-key');

  const heuristic = await synthesizeFindings({
    supabaseKey: 'test-service-key',
    lane: 'ai_models',
    sources: [{ title: 'src', link: 'https://x.test' }],
    generate: failingGenerate(),
  });
  assert.ok(Array.isArray(heuristic.findings), 'heuristic synthesis still produces usable findings');
  assert.ok(heuristic._cascade_errors.length, 'and records why the chain could not answer');
});

test('self-research build plans route, and never throw when the chain is down', async () => {
  const area = { id: 'ai_news_build', label: 'AI news → build plan', instruction: 'x' };
  const sources = [{ title: 'Some launch', link: 'https://y.test' }];

  const gen = stubGenerate(JSON.stringify({ finding: 'They shipped X', build_plan: { priority: 'high' } }), 'runpod');
  const out = await synthesizeArea({ area, sources, jspaceContext: '', supabaseKey: 'test-service-key', generate: gen });
  assert.equal(out._provider, 'axon-v1-runpod');
  assert.equal(out.finding, 'They shipped X');

  const down = await synthesizeArea({
    area,
    sources,
    jspaceContext: '',
    supabaseKey: 'test-service-key',
    generate: failingGenerate(),
  });
  assert.equal(down._provider, 'heuristic');
  assert.match(down.finding, /Some launch/, 'the honest gather-only row still names the real source');
});

test('wisdom polish routes, and leaves the heuristic items alone when it cannot', async () => {
  const items = [{ fingerprint: 'fp1', title: 'raw title', principle: 'raw principle', application: 'raw', domain: 'ops' }];

  const gen = stubGenerate(JSON.stringify({ items: [{ fingerprint: 'fp1', title: 'tight title' }] }), 'openrouter');
  const polished = await polishWisdomTiered(items, { supabaseKey: 'test-service-key' }, gen);
  assert.equal(polished.provider, 'openrouter');
  assert.equal(polished.items[0].title, 'tight title');

  const down = await polishWisdomTiered(items, { supabaseKey: 'test-service-key' }, failingGenerate());
  assert.equal(down.provider, 'heuristic');
  assert.equal(down.items[0].title, 'raw title', 'unpolished but honest');
});

// --- end to end: the real default path walks the locked chain -------------------------
test('the default path really walks the chain and stops at the first free lane', async () => {
  const ROUTES = {
    'ollama-local': { id: 'r-local', name: 'ollama-local', base_url: 'http://localhost:11434', secret_key: null, enabled: true },
    'runpod-axon-v1': { id: 'r-runpod', name: 'runpod-axon-v1', base_url: null, secret_key: 'RUNPOD_AXON_V1_KEY', enabled: true },
    openrouter: { id: 'r-or', name: 'openrouter', base_url: 'https://openrouter.ai/api/v1', secret_key: 'OPENROUTER_API_KEY', enabled: true },
    'gemini-api': { id: 'r-gemini', name: 'gemini-api', base_url: null, secret_key: 'GEMINI_API_KEY', enabled: true },
    'anthropic-api': { id: 'r-anthropic', name: 'anthropic-api', base_url: null, secret_key: 'ANTHROPIC_API_KEY', enabled: true },
  };
  const MODELS = {
    'r-local': [{ id: 'm-local', model: 'axon-ornith', enabled: true, cost_tier: 0, priority: 1 }],
    'r-runpod': [{ id: 'm-runpod', model: 'axon-v1', enabled: true, cost_tier: 0, priority: 1 }],
    'r-or': [{ id: 'm-or', model: 'a-free-model', enabled: true, cost_tier: 0, priority: 1 }],
    'r-gemini': [{ id: 'm-gemini', model: 'a-flash-model', enabled: true, cost_tier: 0, priority: 1 }],
    'r-anthropic': [{ id: 'm-anthropic', model: 'a-paid-model', enabled: true, cost_tier: 3, priority: 1 }],
  };
  const json = (data) => ({ ok: true, status: 200, json: async () => data });
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/rest/v1/axon_llm_chain')) return json([]); // no rows -> locked default order
    if (u.includes('/rest/v1/router_routes')) {
      const name = new URL(u).searchParams.get('name')?.replace('eq.', '');
      return json(ROUTES[name] ? [ROUTES[name]] : []);
    }
    if (u.includes('/rest/v1/router_models')) {
      const routeId = new URL(u).searchParams.get('route_id')?.replace('eq.', '');
      return json(MODELS[routeId] || []);
    }
    if (u.includes('/rest/v1/axon_account_provider_keys')) return json([]);
    if (u.includes('/rest/v1/ni_platform_secrets')) {
      const key = decodeURIComponent(new URL(u).searchParams.get('key')?.replace('eq.', '') || '');
      // Only the free OpenRouter lane has a key here; local and RunPod cannot answer.
      return json(key === 'OPENROUTER_API_KEY' ? [{ value: 'free-lane-key' }] : []);
    }
    if (u.includes('/rest/v1/axon_cost_ledger')) return { ok: true, status: 200 };
    if (u.includes('nvg_mini_jobs')) return { ok: false, status: 500, json: async () => ({}) };
    if (u.includes('openrouter.ai')) {
      return json({ choices: [{ message: { content: JSON.stringify({ email_subject: 'Follow up', email_body: 'Still here.' }) } }] });
    }
    throw new Error(`unmocked fetch: ${u}`);
  };

  try {
    const draft = await haikuFollowUp(
      { supabaseKey: 'test-service-key' },
      { handle: 'Acme Freight', niche: 'freight', comment_draft: 'Saw your ops bottleneck…' },
    );
    assert.equal(draft.email_subject, 'Follow up');
    assert.ok(calls.some((u) => u.includes('axon_llm_chain')), 'the chain config is read from the brain');
    assert.ok(calls.some((u) => u.includes('nvg_mini_jobs')), 'the local lane is tried first');
    assert.ok(calls.some((u) => u.includes('openrouter.ai')), 'a free lane answered');
    assert.ok(!calls.some((u) => u.includes('api.anthropic.com')), 'the paid lane is never reached');
    assert.ok(!calls.some((u) => u.includes('generativelanguage.googleapis.com')), 'no direct provider call of its own');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
