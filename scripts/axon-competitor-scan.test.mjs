#!/usr/bin/env node
/**
 * AXON competitor scan (rebuild 2026-10-06, IU2-AXON-COMPETITOR-1006).
 * Offline: fetch, the model chain and the database are all mocked, no secrets, no network.
 *
 * Proves:
 *   (a) a competitor with real sources yields a gap plan with every field, citing real sources
 *   (b) a competitor with no real source yields an honest "no real source, retry next run"
 *       entry and NO plan, and the model is never called (regression test for JB's
 *       never-heuristic rule; also covers sources that do not name the competitor, and a
 *       model chain that is down)
 *   (c) report path + header written into the vault's Competitive Intel folder
 *   (d) the agent_bus message shape to AXON Executive, and nothing sent to anyone else
 *   (e) hitting the time budget sets the resume flag and carries the unreached competitor
 *   (f) --dry-run makes zero network calls (in-process and through the real CLI)
 *
 * Run: node --test scripts/axon-competitor-scan.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  INTEL_DIR_REL,
  JOB_ID,
  runCompetitorScan,
  scanCompetitor,
  validateGapPlan,
  mentionsCompetitor,
  rotationOrdinal,
  pickCompetitors,
  competitorPool,
  competitorAliases,
  decodeCarry,
  encodeCarry,
  nextCarry,
  buildBusMessage,
} from './axon-competitor-scan.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'axon-competitor-scan.mjs');
const NOW = new Date('2026-10-05T12:00:00Z'); // a Monday

const REGISTRY = {
  updated: '2026-07-06',
  capability_axes: ['persistent_cloud_mind', 'local_inference_option'],
  axon_target_scores: { persistent_cloud_mind: 3, local_inference_option: 1 },
  competitors: [
    { id: 'odei', name: 'ODEI', category: 'personal_ai_os', url: 'https://odei.ai/', threat: 'critical', strengths: ['Proactive persistent layer'], scores: { persistent_cloud_mind: 3, local_inference_option: 2 }, watch_queries: ['ODEI personal AI operating system', 'ODEI AI governance L5'] },
    { id: 'vellum', name: 'Vellum', category: 'developer_personal_ai', url: 'https://www.vellum.ai/', threat: 'medium', strengths: ['Developer API'], scores: { persistent_cloud_mind: 1, local_inference_option: 2 }, watch_queries: ['Vellum AI agent platform'] },
    { id: 'naia', name: 'Naia OS', category: 'personal_ai_os', url: 'https://naia.example/', threat: 'medium', strengths: [], scores: {}, watch_queries: ['Naia OS personal AI'] },
    { id: 'collide', name: 'AppLovin Axon AI', category: 'name_collision', url: 'https://applovin.example/', watch_queries: ['AppLovin Axon'] },
  ],
};

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axon-compscan-vault-'));
  const dir = path.join(root, INTEL_DIR_REL);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'competitor-registry.json'), JSON.stringify(REGISTRY));
  return root;
}

function fakeSb({ learning = null, wake = { cmds: ['node scripts/axon-competitor-scan.mjs'], cron: ['0 8 * * 1,3,5'], repo: 'axon' }, findings = [] } = {}) {
  const inserts = [];
  const patches = [];
  return {
    inserts,
    patches,
    sbSelect: async (table) => {
      if (table === 'Learnings') return learning ? [{ learning, date: '2026-10-03' }] : [];
      if (table === 'nvg_agent_routines') return [{ wake_config: wake }];
      if (table === 'axon_research_findings') return findings;
      return []; // axon_cron_jobs: no row, the guard fails open
    },
    sbInsert: async (table, row) => {
      inserts.push({ table, row });
      return { id: `row-${inserts.length}`, ...row };
    },
    sbPatch: async (table, filter, row) => {
      patches.push({ table, filter, row });
      return row;
    },
  };
}

const json = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
const html = (s) => ({ ok: true, status: 200, text: async () => s });

/** SerpApi answers with `rows`; DuckDuckGo (the fallback) answers with an empty page. */
function mockFetch(rows) {
  const calls = [];
  const fn = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('https://serpapi.com/')) return json({ organic_results: rows });
    return html('<html><body></body></html>');
  };
  fn.calls = calls;
  return fn;
}

const ODEI_ROWS = [
  { title: 'ODEI ships proactive memory layer for personal AI', link: 'https://news.example/odei-memory', snippet: 'ODEI now keeps a persistent, policy-controlled user model across sessions.' },
  { title: 'ODEI governance taxonomy explained', link: 'https://news.example/odei-governance', snippet: 'The L5 governance model gates every agent action.' },
];

const goodPlan = (urls = ['https://news.example/odei-memory']) => ({
  gap: 'ODEI keeps a policy-gated persistent user model that AXON does not expose to the user.',
  why_it_matters: 'Users can see and edit what the assistant knows about them, which builds trust AXON lacks.',
  threat: 'ODEI is shipping a visible memory layer.',
  pivot: 'AXON ships an editable memory view backed by its existing persistent store.',
  build_plan: { what_to_build: 'A user-facing memory viewer with edit and delete', steps: ['Expose stored memories over an API', 'Build the viewer page', 'Add edit and delete with an audit trail'], effort: 'medium', priority: 'high' },
  plain_english: 'ODEI lets people see what their assistant remembers. AXON can do the same with what it already stores.',
  source_urls: urls,
});

function stubGenerate(handler) {
  const calls = [];
  const fn = async (key, opts) => {
    calls.push({ key, opts });
    return handler(opts, calls.length);
  };
  fn.calls = calls;
  return fn;
}

const answer = (obj) => ({ text: JSON.stringify(obj), source: 'gemini', provider: 'gemini', model: 'gemini-test' });

function baseOpts(overrides = {}) {
  return {
    now: NOW,
    vaultRoot: makeVault(),
    registry: REGISTRY,
    sb: fakeSb({ learning: '[LOOP:axon-competitor-scan] 2026-10-03 — Apply next run: retry-first: ODEI(0)' }),
    supabaseKey: 'test-key',
    serpApiKey: 'serp-test',
    perRun: 1,
    retryDelayMs: 0,
    log: () => {},
    ...overrides,
  };
}

// ── (a) real sources -> full gap plan ─────────────────────────────────────────

test('(a) a competitor with real sources produces a gap plan with every field, citing fetched sources', async () => {
  const fetchImpl = mockFetch(ODEI_ROWS);
  const generate = stubGenerate(() => answer(goodPlan(['https://news.example/odei-memory'])));
  const opts = baseOpts({ fetchImpl, generate });

  const result = await runCompetitorScan(opts);
  const scan = result.scans[0];

  assert.equal(scan.competitor, 'ODEI');
  assert.equal(scan.status, 'plan');
  const p = scan.plan;
  for (const f of ['gap', 'why_it_matters', 'plain_english']) assert.ok(p[f] && typeof p[f] === 'string', `plan.${f}`);
  assert.ok(p.build_plan.what_to_build);
  assert.ok(Array.isArray(p.build_plan.steps) && p.build_plan.steps.length >= 1);
  assert.ok(['small', 'medium', 'large'].includes(p.build_plan.effort));
  assert.ok(['high', 'medium', 'low'].includes(p.build_plan.priority));
  assert.deepEqual(p.source_urls, ['https://news.example/odei-memory']);
  assert.equal(scan.provider, 'gemini');

  // one model call through the router seam, JSON mode, real sources in the prompt
  assert.equal(generate.calls.length, 1);
  assert.equal(generate.calls[0].opts.jsonMode, true);
  assert.equal(generate.calls[0].opts.kind, 'reasoning_planning');
  assert.match(generate.calls[0].opts.user, /https:\/\/news\.example\/odei-memory/);
  // only search traffic, nothing else
  assert.ok(fetchImpl.calls.length >= 1 && fetchImpl.calls.every((u) => u.startsWith('https://serpapi.com/')));
});

test('(a2) a plan that cites a source that was never fetched is rejected, not repaired', async () => {
  const generate = stubGenerate(() => answer(goodPlan(['https://invented.example/not-fetched'])));
  const scan = await scanCompetitor(REGISTRY.competitors[0], { registry: REGISTRY, supabaseKey: 'k', serpApiKey: 'serp-test', fetchImpl: mockFetch(ODEI_ROWS), generate, retryDelayMs: 0 });
  assert.equal(scan.status, 'no_plan');
  assert.equal(scan.plan, undefined);
  assert.equal(generate.calls.length, 2, 'one retry, then give up');
  assert.match(scan.errors.join(' '), /no source that was actually fetched/);
});

// ── (b) no real source -> honest entry, no plan, no model call ────────────────

test('(b) no sources: honest "retry next run" entry, NO plan, the model is never called', async () => {
  const generate = stubGenerate(() => {
    throw new Error('model must not be called without a source');
  });
  const opts = baseOpts({ fetchImpl: mockFetch([]), generate });

  const result = await runCompetitorScan(opts);
  const scan = result.scans[0];

  assert.equal(scan.status, 'no_source');
  assert.equal(scan.plan, undefined);
  assert.equal('gap' in scan, false);
  assert.equal(generate.calls.length, 0, 'never-heuristic rule: no model call, no stand-in plan');

  const report = fs.readFileSync(result.report.datedPath, 'utf8');
  assert.match(report, /No real source this run/);
  assert.match(report, /Will retry next run/);
  assert.doesNotMatch(report, /### Gap → Build plan/);

  // retried first next run, and the bus says so without asking EXEC to answer anything
  const bus = opts.sb.inserts.find((i) => i.table === 'agent_bus').row;
  assert.equal(bus.needs_answer, false);
  assert.deepEqual(bus.body.plans, []);
  assert.equal(bus.body.no_source[0].competitor, 'ODEI');
  const loop = opts.sb.inserts.find((i) => i.table === 'Learnings').row.learning;
  assert.match(loop, /retry-first: ODEI\(1\)/);
});

test('(b2) results that never name the competitor are not sources', async () => {
  const noise = [{ title: 'Kodeine cough syrup recall', link: 'https://news.example/kodeine', snippet: 'Unrelated.' }];
  const generate = stubGenerate(() => answer(goodPlan()));
  const scan = await scanCompetitor(REGISTRY.competitors[0], { registry: REGISTRY, supabaseKey: 'k', serpApiKey: 'serp-test', fetchImpl: mockFetch(noise), generate, retryDelayMs: 0 });
  assert.equal(scan.status, 'no_source');
  assert.match(scan.reason, /none mention ODEI/);
  assert.equal(generate.calls.length, 0);
});

test('(b3) sources found but the model chain is down: no plan is invented, retried next run', async () => {
  const generate = stubGenerate(() => {
    throw new Error('axonGenerate: every tier in the chain failed or was unconfigured: local: mini unreachable | openrouter: HTTP 429');
  });
  const opts = baseOpts({ fetchImpl: mockFetch(ODEI_ROWS), generate });
  const result = await runCompetitorScan(opts);
  const scan = result.scans[0];

  assert.equal(scan.status, 'no_plan');
  assert.equal(scan.plan, undefined);
  assert.equal(scan.sources.length, 2, 'the real sources are still listed');
  assert.match(fs.readFileSync(result.report.datedPath, 'utf8'), /No stand-in plan was written/);
  assert.match(opts.sb.inserts.find((i) => i.table === 'Learnings').row.learning, /retry-first: ODEI\(1\)/);
});

test('(b4) the model may say there is no gap; that is honest, not a plan and not a retry', async () => {
  const generate = stubGenerate(() => answer({ no_gap: true, reason: 'Sources only restate features AXON already has.' }));
  const opts = baseOpts({ fetchImpl: mockFetch(ODEI_ROWS), generate });
  const scan = (await runCompetitorScan(opts)).scans[0];
  assert.equal(scan.status, 'no_gap');
  assert.equal(scan.plan, undefined);
  assert.doesNotMatch(opts.sb.inserts.find((i) => i.table === 'Learnings').row.learning, /retry-first/);
});

// ── (c) report path + header ──────────────────────────────────────────────────

test('(c) report lands in the vault Competitive Intel folder with the right header; a same-day resume gets a -2 file', async () => {
  const vaultRoot = makeVault();
  const run = () => runCompetitorScan(baseOpts({ vaultRoot, fetchImpl: mockFetch(ODEI_ROWS), generate: stubGenerate(() => answer(goodPlan())) }));

  const first = await run();
  const dir = path.join(vaultRoot, 'NORTHSiDE Intelligence (NI)/Sector 5 — AXON/Competitive Intel');
  assert.equal(first.report.datedPath, path.join(dir, '2026-10-05.md'));
  assert.equal(first.report.latestPath, path.join(dir, 'LATEST.md'));

  const dated = fs.readFileSync(first.report.datedPath, 'utf8');
  assert.ok(dated.startsWith('---\ntype: log\ntitle: AXON Competitor Scan — 2026-10-05\nstatus: active\ncanonical: false\nupdated: 2026-10-05\n'));
  assert.match(dated, /\n# AXON Competitor Scan — 2026-10-05\n/);
  assert.match(dated, /\*\*Scanned today:\*\* ODEI/);
  assert.match(dated, /\[\[Competitor Gap Register\]\]/);
  assert.match(dated, /### Gap → Build plan/);
  assert.match(dated, /<!-- analysis-source: gemini \(gemini-test\) -->/);
  assert.match(fs.readFileSync(first.report.latestPath, 'utf8'), /^---\ntype: moc\ntitle: AXON Competitor Scan — 2026-10-05/);

  const second = await run();
  assert.equal(second.report.datedPath, path.join(dir, '2026-10-05-2.md'));
  assert.equal(second.report.relPath, `${INTEL_DIR_REL}/2026-10-05-2.md`);
});

// ── (d) bus message shape ─────────────────────────────────────────────────────

test('(d) the agent_bus message to AXON Executive has the agreed shape; nothing else leaves the building', async () => {
  const fetchImpl = mockFetch(ODEI_ROWS);
  const opts = baseOpts({ fetchImpl, generate: stubGenerate(() => answer(goodPlan())) });
  const result = await runCompetitorScan(opts);

  const bus = opts.sb.inserts.filter((i) => i.table === 'agent_bus');
  assert.equal(bus.length, 1);
  const row = bus[0].row;
  assert.equal(row.from_agent, 'AXON-Competitor-Scan');
  assert.equal(row.to_agent, 'AXON Executive');
  assert.equal(row.subject, 'COMPETITOR-SCAN-GAP-PLANS-20261005');
  assert.equal(row.needs_answer, true);
  assert.equal(row.status, 'open');
  assert.equal(row.body.kind, 'competitor_gap_build_plans');
  assert.equal(row.body.date, '2026-10-05');
  assert.equal(row.body.stopped_early_before, null);
  assert.equal(row.body.report_path, result.report.relPath);
  assert.match(row.body.plain_english_summary, /^ODEI: /);
  const plan = row.body.plans[0];
  assert.deepEqual(Object.keys(plan).sort(), ['build_plan', 'competitor', 'gap', 'pivot', 'plain_english', 'provider', 'source_urls', 'threat', 'why_it_matters']);
  assert.deepEqual(row.body.no_source, []);

  // only the bus and the loop note were written; no search call went anywhere but the search APIs
  assert.deepEqual([...new Set(opts.sb.inserts.map((i) => i.table))].sort(), ['Learnings', 'agent_bus']);
  assert.ok(fetchImpl.calls.every((u) => /serpapi\.com|duckduckgo\.com/.test(u)));
  // the loop note records what worked
  assert.match(opts.sb.inserts.find((i) => i.table === 'Learnings').row.learning, /^\[LOOP:axon-competitor-scan\] .*Worked: ODEI via gemini/);
});

test('(d2) buildBusMessage: zero plans means nothing for EXEC to answer', () => {
  const msg = buildBusMessage({ date: '2026-10-05', scans: [{ competitor: 'ODEI', status: 'no_source', reason: 'nothing' }] });
  assert.equal(msg.needsAnswer, false);
  assert.equal(msg.toAgent, 'AXON Executive');
});

test('(d3) the script never reaches JB directly', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(src, /telegramAlert|sendToJb|telegramSend|api\.telegram\.org|slack-post|resend/i);
});

// ── (e) time budget -> resume flag ────────────────────────────────────────────

test('(e) hitting the time budget flags a resume within ~12h and carries the unreached competitor', async () => {
  let checks = 0;
  const opts = baseOpts({
    perRun: 2,
    sb: fakeSb({ learning: '[LOOP:axon-competitor-scan] 2026-10-03 — Apply next run: retry-first: ODEI(0); Vellum(0)' }),
    fetchImpl: mockFetch(ODEI_ROWS),
    generate: stubGenerate(() => answer(goodPlan())),
    budgetCheck: () => ++checks > 1, // fine before the first competitor, expired before the second
  });
  const result = await runCompetitorScan(opts);

  assert.equal(result.scans.length, 1);
  assert.equal(result.stoppedEarlyBefore, 'Vellum');

  const patch = opts.sb.patches.find((p) => p.table === 'nvg_agent_routines' && p.row.wake_config.resume_needed_at);
  assert.ok(patch, 'resume flag written to the roster row');
  assert.match(patch.filter, /routine_id=eq\.axon-competitor-scan/);
  const resumeAt = Date.parse(patch.row.wake_config.resume_needed_at);
  assert.ok(Math.abs(resumeAt - (Date.now() + 12 * 3600_000)) < 60_000, 'about 12 hours out');
  assert.deepEqual(patch.row.wake_config.cmds, ['node scripts/axon-competitor-scan.mjs'], 'existing roster config kept');
  assert.match(patch.row.wake_config.resume_reason, /Vellum/);

  const bus = opts.sb.inserts.find((i) => i.table === 'agent_bus').row;
  assert.equal(bus.body.stopped_early_before, 'Vellum');
  assert.match(opts.sb.inserts.find((i) => i.table === 'Learnings').row.learning, /retry-first: Vellum\(0\)/);
});

test('(e2) a finished run clears the resume flag instead of setting it', async () => {
  const opts = baseOpts({ fetchImpl: mockFetch(ODEI_ROWS), generate: stubGenerate(() => answer(goodPlan())) });
  await runCompetitorScan(opts);
  const wake = opts.sb.patches.find((p) => p.table === 'nvg_agent_routines').row.wake_config;
  assert.equal(wake.resume_needed_at, undefined);
});

// ── (f) dry run: zero network, zero model, zero database ──────────────────────

test('(f) dry-run in-process: no fetch, no model call, no database access, plan printed', async () => {
  const realFetch = globalThis.fetch;
  let netCalls = 0;
  globalThis.fetch = async () => {
    netCalls++;
    throw new Error('network is blocked in dry-run');
  };
  const boom = () => {
    throw new Error('database touched in dry-run');
  };
  const lines = [];
  try {
    const result = await runCompetitorScan({
      dryRun: true, now: NOW, vaultRoot: makeVault(), registry: REGISTRY, perRun: 2,
      sb: { sbSelect: boom, sbInsert: boom, sbPatch: boom },
      generate: boom, fetchImpl: boom, log: (l) => lines.push(l),
    });
    assert.equal(result.dryRun, true);
    assert.equal(netCalls, 0);
    assert.equal(result.picked.length, 2);
    assert.ok(lines.some((l) => /DRY RUN/.test(l)));
    assert.ok(lines.some((l) => l.includes(result.picked[0])));
    assert.ok(lines.some((l) => l.includes(path.join(INTEL_DIR_REL, '2026-10-05.md'))));
  } finally {
    globalThis.fetch = realFetch;
  }
});

function cliEnv(extra = {}) {
  return { PATH: process.env.PATH, HOME: os.tmpdir(), ...extra };
}

function networkBlockPreload() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'axon-compscan-preload-')), 'block-net.mjs');
  fs.writeFileSync(
    file,
    [
      "import net from 'node:net';",
      "globalThis.fetch = () => { throw new Error('NETWORK_BLOCKED fetch'); };",
      "net.Socket.prototype.connect = function () { throw new Error('NETWORK_BLOCKED socket'); };",
      '',
    ].join('\n'),
  );
  return pathToFileURL(file).href;
}

test('(f2) dry-run through the real CLI: exit 0, prints the plan, no network, no secret in the output', () => {
  const vaultRoot = makeVault();
  const r = spawnSync(process.execPath, ['--import', networkBlockPreload(), SCRIPT, '--dry-run', '--date=2026-10-05'], {
    encoding: 'utf8',
    env: cliEnv({ NV_VAULT_GIT_DIR: vaultRoot, SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key-do-not-print', SERPAPI_API_KEY: 'fake-serp-key-do-not-print' }),
  });
  assert.equal(r.status, 0, r.stderr);
  const out = `${r.stdout}\n${r.stderr}`;
  assert.match(out, /DRY RUN/);
  assert.match(out, /Would scan \(2 per run\): /);
  assert.match(out, /2026-10-05\.md/);
  assert.doesNotMatch(out, /NETWORK_BLOCKED/);
  assert.doesNotMatch(out, /do-not-print/);
  // nothing was written into the vault
  assert.deepEqual(fs.readdirSync(path.join(vaultRoot, INTEL_DIR_REL)), ['competitor-registry.json']);
});

test('(f3) a real run with the required env name missing exits non-zero with one plain sentence', () => {
  const r = spawnSync(process.execPath, ['--import', networkBlockPreload(), SCRIPT], {
    encoding: 'utf8',
    env: cliEnv({ NV_VAULT_GIT_DIR: makeVault() }),
  });
  assert.equal(r.status, 2);
  const lines = r.stderr.trim().split('\n');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /needs SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(`${r.stdout}${r.stderr}`, /NETWORK_BLOCKED/);
});

// ── supporting logic ──────────────────────────────────────────────────────────

test('rotation: every competitor is reached within a few scheduled Mon/Wed/Fri runs (the old getUTCDay rotation only reached 6 of 9)', () => {
  const pool = Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, category: 'x' }));
  const seen = new Set();
  let runs = 0;
  for (let day = 0; runs < 5; day++) {
    const d = new Date(Date.UTC(2026, 9, 5 + day, 12));
    if (![1, 3, 5].includes(d.getUTCDay())) continue;
    runs++;
    for (const c of pickCompetitors(pool, { date: d, count: 2 })) seen.add(c.name);
  }
  assert.equal(seen.size, 9);
  assert.equal(rotationOrdinal(new Date('2026-10-07T12:00:00Z')) - rotationOrdinal(new Date('2026-10-05T12:00:00Z')), 1);
});

test('rotation: the name-collision row is never scanned, carry-over goes first', () => {
  const pool = competitorPool(REGISTRY);
  assert.ok(!pool.some((c) => c.name === 'AppLovin Axon AI'));
  const picked = pickCompetitors(pool, { date: NOW, count: 2, carry: [{ name: 'naia os', streak: 1 }] });
  assert.equal(picked[0].name, 'Naia OS');
  assert.equal(picked.length, 2);
});

test('retry carry: round-trips through the loop note text, and a competitor with nothing 3 runs running is dropped', () => {
  const note = `[LOOP:${JOB_ID}] 2026-10-06 — Worked: ODEI via gemini — Didn't work: x — Apply next run: ${encodeCarry([{ name: 'Cursor / Cowork', streak: 2 }, { name: 'ODEI', streak: 0 }])} | another note`;
  assert.deepEqual(decodeCarry(note), [{ name: 'Cursor / Cowork', streak: 2 }, { name: 'ODEI', streak: 0 }]);
  assert.deepEqual(decodeCarry('[LOOP:axon-competitor-scan] nothing to retry'), []);

  const { carry, dropped } = nextCarry({ scans: [{ competitor: 'ODEI', status: 'no_source' }, { competitor: 'Vellum', status: 'no_plan' }], carryIn: [{ name: 'ODEI', streak: 2 }] });
  assert.deepEqual(dropped, [{ name: 'ODEI', streak: 3 }]);
  assert.deepEqual(carry, [{ name: 'Vellum', streak: 1 }]);
});

test('mentionsCompetitor uses whole-word matches on name, short name and site', () => {
  const [odei, , naia] = REGISTRY.competitors;
  assert.ok(mentionsCompetitor(odei, { title: 'Kodeine?', snippet: '', link: 'https://x.example/odei.ai/post' }) === true, 'site label in the link counts');
  assert.ok(!mentionsCompetitor(odei, { title: 'Kodeine cough syrup', snippet: '', link: 'https://x.example/a' }));
  assert.ok(mentionsCompetitor(naia, { title: 'Naia launches an agent shell', snippet: '', link: 'https://x.example/b' }));
});

test('(g1) a competitor hosted on a shared site is matched by its repo name, not by the host (an unrelated GitHub repo is not a source)', () => {
  const naiaOnGithub = { name: 'Naia OS', category: 'personal_ai_os', url: 'https://github.com/JaredKarma/naia-os' };
  const neuro = { name: 'NeuroBridge', category: 'nd_middleware', url: 'https://github.com/AdilShamim8/NeuroBridge' };
  const unrelated = { title: 'Some random project', snippet: 'A different tool', link: 'https://github.com/someone/unrelated-tool' };
  assert.ok(!competitorAliases(naiaOnGithub).includes('github'));
  assert.ok(!competitorAliases(neuro).includes('github'));
  assert.equal(mentionsCompetitor(naiaOnGithub, unrelated), false);
  assert.equal(mentionsCompetitor(neuro, unrelated), false);
  // the real repo still counts as a source
  assert.equal(mentionsCompetitor(naiaOnGithub, { title: 'naia-os release', snippet: '', link: 'https://github.com/JaredKarma/naia-os/releases' }), true);
  assert.equal(mentionsCompetitor(neuro, { title: 'Release notes', snippet: '', link: 'https://github.com/AdilShamim8/NeuroBridge/releases' }), true);
});

test('(g2) a tool JB already runs (jb_incumbent, the retired Cursor row) is not in the scan pool', () => {
  const registry = { competitors: [...REGISTRY.competitors, { id: 'cursor', name: 'Cursor / Cowork', category: 'jb_incumbent', url: 'https://cursor.com/' }] };
  const pool = competitorPool(registry);
  assert.ok(!pool.some((c) => c.name === 'Cursor / Cowork'));
  assert.ok(pool.some((c) => c.name === 'ODEI'));
});

test('(g3) plans handed to EXEC are marked as built from web pages, so EXEC treats them as data', () => {
  const msg = buildBusMessage({ date: '2026-10-05', scans: [{ competitor: 'ODEI', status: 'plan', plan: { gap: 'g', why_it_matters: 'w', threat: 't', pivot: 'p', build_plan: 'b', plain_english: 'x', source_urls: ['https://odei.ai/'] }, provider: 'gemini' }] });
  assert.equal(msg.body.untrusted_web_derived, true);
});

test('validateGapPlan rejects missing fields and out-of-range effort/priority, and keeps only fetched source urls', () => {
  const sources = [{ link: 'https://a.example/1' }];
  const ok = validateGapPlan(goodPlan(['https://a.example/1', 'https://elsewhere.example']), sources);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan.source_urls, ['https://a.example/1']);

  const bad = goodPlan(['https://a.example/1']);
  bad.build_plan.effort = 'enormous';
  delete bad.gap;
  const verdict = validateGapPlan(bad, sources);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /gap/);
  assert.match(verdict.reason, /effort/);
  assert.equal(validateGapPlan({ no_gap: true, reason: 'none' }, sources).kind, 'no_gap');
});

test('validateGapPlan: a trailing slash dropped by the model still matches the fetched source, returned in fetched form', () => {
  const verdict = validateGapPlan(goodPlan(['https://a.example/1/']), [{ link: 'https://a.example/1' }]);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.plan.source_urls, ['https://a.example/1']);
});

test('report: source links with spaces or parentheses cannot break the markdown', async () => {
  const rows = [{ title: 'ODEI [beta] launch', link: 'https://news.example/odei (beta)/post', snippet: 'ODEI ships.' }];
  const generate = stubGenerate(() => answer(goodPlan(['https://news.example/odei (beta)/post'])));
  const result = await runCompetitorScan(baseOpts({ fetchImpl: mockFetch(rows), generate }));
  const report = fs.readFileSync(result.report.datedPath, 'utf8');
  assert.match(report, /\[ODEI beta launch\]\(https:\/\/news\.example\/odei%20%28beta%29\/post\)/);
});

test('a crash mid-run still leaves the retry list for the next run, without duplicates', async () => {
  const broken = { ...REGISTRY, competitors: REGISTRY.competitors.map((c) => (c.name === 'ODEI' ? { ...c, watch_queries: 'not-an-array' } : c)) };
  const opts = baseOpts({ registry: broken, fetchImpl: mockFetch(ODEI_ROWS), generate: stubGenerate(() => answer(goodPlan())) });
  await assert.rejects(() => runCompetitorScan(opts), /filter is not a function/);
  const note = opts.sb.inserts.find((i) => i.table === 'Learnings').row.learning;
  assert.match(note, /run crashed/);
  assert.match(note, /retry-first: ODEI\(0\)(?!.*ODEI)/);
  assert.equal(opts.sb.inserts.some((i) => i.table === 'agent_bus'), false);
});
