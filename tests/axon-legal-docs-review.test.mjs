#!/usr/bin/env node
/**
 * AXON Legal Docs (IU2-AXON-LEGAL-1006) — proves an unconfirmed URL and a
 * failed fetch are honest skips (never a fabricated mismatch), the model
 * review never invents a finding when the cascade is unreachable, and a
 * live run writes a lab-log row plus a conditional Executive handoff that
 * splits charges/data mismatches from routine ones.
 *
 * Offline: no network, no env secrets. Run: node --test tests/axon-legal-docs-review.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  stripHtml,
  listLegalDocs,
  buildReviewPrompt,
  reviewDocument,
  buildDraftNote,
  buildHandoffBody,
  runLegalDocsReview,
  DEFAULT_SITES,
  LEGAL_DOCS_LANE_ID,
} from '../lib/axon-legal-docs-review.mjs';
// New exports are read off the namespace so a test against older code fails on its assertion, not on import.
import * as lib from '../lib/axon-legal-docs-review.mjs';

function stubGenerate(text, source = 'openrouter') {
  const calls = [];
  const fn = async (supabaseKey, opts) => {
    calls.push({ supabaseKey, opts });
    return { text, source, model: 'test-model' };
  };
  fn.calls = calls;
  return fn;
}

function failingGenerate(message = 'every tier in the chain failed') {
  return async () => {
    throw new Error(message);
  };
}

function stubFetch(responses) {
  return async (url) => {
    const entry = responses[url];
    if (!entry) throw new Error(`no stub for ${url}`);
    if (entry.error) throw new Error(entry.error);
    return { ok: entry.ok !== false, status: entry.status || 200, text: async () => entry.text || '' };
  };
}

function fakeSb() {
  const inserted = [];
  const sbInsert = async (table, row) => {
    inserted.push({ table, row });
    if (table === 'axon_research_runs') return { id: `run-${inserted.length}`, ...row };
    return { id: `row-${inserted.length}`, ...row };
  };
  return { sbInsert, inserted };
}

// ---------------------------------------------------------------------------
// stripHtml / listLegalDocs
// ---------------------------------------------------------------------------

test('stripHtml drops tags/scripts/styles and collapses whitespace', () => {
  const html = '<html><head><style>.a{}</style></head><body><script>evil()</script><p>Hello   world</p></body></html>';
  assert.equal(stripHtml(html), 'Hello world');
});

test('listLegalDocs expands every site into a terms + privacy entry', () => {
  const sites = [{ id: 'a', label: 'A', termsUrl: 'https://a/terms', privacyUrl: null }];
  const docs = listLegalDocs(sites);
  assert.deepEqual(docs, [
    { siteId: 'a', label: 'A', docType: 'terms', url: 'https://a/terms' },
    { siteId: 'a', label: 'A', docType: 'privacy', url: null },
  ]);
});

test('DEFAULT_SITES only ships a confirmed URL for matchfit — others stay null, never guessed', () => {
  const matchfit = DEFAULT_SITES.find((s) => s.id === 'matchfit');
  assert.equal(matchfit.termsUrl, 'https://match-fit.net/terms');
  assert.equal(matchfit.privacyUrl, 'https://match-fit.net/privacy');
  for (const site of DEFAULT_SITES.filter((s) => s.id !== 'matchfit')) {
    assert.equal(site.termsUrl, null);
    assert.equal(site.privacyUrl, null);
  }
});

// ---------------------------------------------------------------------------
// buildReviewPrompt
// ---------------------------------------------------------------------------

test('buildReviewPrompt includes site, doc type, product facts and live text', () => {
  const doc = { siteId: 'matchfit', label: 'Match Fit', docType: 'terms', url: 'https://match-fit.net/terms' };
  const prompt = buildReviewPrompt(doc, 'Live legal text here.', 'Payment flows: Stripe.');
  assert.match(prompt, /Match Fit/);
  assert.match(prompt, /Terms of Service/);
  assert.match(prompt, /Payment flows: Stripe\./);
  assert.match(prompt, /Live legal text here\./);
  assert.match(prompt, /charges_or_data_flag/);
});

// ---------------------------------------------------------------------------
// reviewDocument
// ---------------------------------------------------------------------------

test('reviewDocument skips honestly when no URL is configured — never fabricates a mismatch', async () => {
  const doc = { siteId: 'nsss', label: 'NSSS', docType: 'terms', url: null };
  const result = await reviewDocument({ doc, generate: stubGenerate('{}') });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /no confirmed live URL/);
  assert.deepEqual(result.mismatches, []);
});

test('reviewDocument skips honestly when the live fetch fails', async () => {
  const doc = { siteId: 'matchfit', label: 'Match Fit', docType: 'terms', url: 'https://match-fit.net/terms' };
  const fetchImpl = stubFetch({ 'https://match-fit.net/terms': { error: 'getaddrinfo ENOTFOUND' } });
  const result = await reviewDocument({ doc, fetchImpl, generate: stubGenerate('{}') });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /fetch failed/);
});

test('reviewDocument skips honestly when the model cascade is unreachable — no invented finding', async () => {
  const doc = { siteId: 'matchfit', label: 'Match Fit', docType: 'terms', url: 'https://match-fit.net/terms' };
  const fetchImpl = stubFetch({ 'https://match-fit.net/terms': { text: '<p>Some terms text</p>' } });
  const result = await reviewDocument({ doc, fetchImpl, generate: failingGenerate() });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /no AI cascade reachable/);
  assert.deepEqual(result.mismatches, []);
});

test('reviewDocument parses real mismatches and the charges_or_data_flag from the model', async () => {
  const doc = { siteId: 'matchfit', label: 'Match Fit', docType: 'privacy', url: 'https://match-fit.net/privacy' };
  const fetchImpl = stubFetch({ 'https://match-fit.net/privacy': { text: '<p>We use PayOldCo for payments.</p>' } });
  const modelJson = JSON.stringify({
    mismatches: [{ clause: 'We use PayOldCo', issue: 'Product uses Stripe, not PayOldCo', proposed_wording: 'We use Stripe' }],
    charges_or_data_flag: true,
    flag_reason: 'Payment processor named in the document no longer matches production',
  });
  const result = await reviewDocument({ doc, fetchImpl, generate: stubGenerate(modelJson) });
  assert.equal(result.skipped, false);
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.charges_or_data_flag, true);
  assert.match(result.flagReason, /Payment processor/);
});

// ---------------------------------------------------------------------------
// buildDraftNote / buildHandoffBody
// ---------------------------------------------------------------------------

test('buildDraftNote renders one numbered line per mismatch', () => {
  const result = {
    label: 'Match Fit',
    docType: 'terms',
    mismatches: [{ clause: 'X', issue: 'Y', proposed_wording: 'Z' }],
  };
  const note = buildDraftNote(result);
  assert.match(note, /Match Fit — terms: 1 mismatch\(es\) found\./);
  assert.match(note, /1\. Clause: X/);
  assert.match(note, /Proposed: Z/);
});

test('buildHandoffBody splits charges/data flagged mismatches from routine diffs', () => {
  const results = [
    { skipped: false, label: 'Match Fit', docType: 'terms', mismatches: [{ clause: 'a', issue: 'b', proposed_wording: 'c' }], charges_or_data_flag: true, flagReason: 'charges change' },
    { skipped: false, label: 'Match Fit', docType: 'privacy', mismatches: [{ clause: 'd', issue: 'e', proposed_wording: 'f' }], charges_or_data_flag: false, flagReason: null },
    { skipped: true, label: 'NSSS', docType: 'terms', mismatches: [], charges_or_data_flag: false, flagReason: null },
  ];
  const body = buildHandoffBody(results, null);
  assert.equal(body.kind, LEGAL_DOCS_LANE_ID);
  assert.equal(body.documents_reviewed, 2);
  assert.equal(body.documents_with_mismatches, 2);
  assert.equal(body.needs_jb_decision.length, 1);
  assert.equal(body.needs_jb_decision[0].reason, 'charges change');
  assert.equal(body.routine_diffs.length, 1);
  assert.match(body.instructions, /never opens a PR itself/);
});

// ---------------------------------------------------------------------------
// runLegalDocsReview
// ---------------------------------------------------------------------------

test('runLegalDocsReview dry run never writes a lab-log row or handoff', async () => {
  const { sbInsert, inserted } = fakeSb();
  const sites = [{ id: 'nsss', label: 'NSSS', termsUrl: null, privacyUrl: null }];
  const result = await runLegalDocsReview({ sbInsert, dryRun: true, sites, generate: stubGenerate('{}') });
  assert.equal(result.runId, null);
  assert.equal(inserted.length, 0);
  assert.match(result.summary, /0\/2 document\(s\) reviewed/);
});

test('runLegalDocsReview live run writes a run row and, with mismatches, a handoff split by flag', async () => {
  const { sbInsert, inserted } = fakeSb();
  const sites = [{ id: 'matchfit', label: 'Match Fit', termsUrl: 'https://mf/terms', privacyUrl: 'https://mf/privacy' }];
  const fetchImpl = stubFetch({
    'https://mf/terms': { text: '<p>terms text</p>' },
    'https://mf/privacy': { text: '<p>privacy text</p>' },
  });
  let call = 0;
  const generate = async () => {
    call += 1;
    if (call === 1) {
      return { text: JSON.stringify({ mismatches: [{ clause: 'a', issue: 'b', proposed_wording: 'c' }], charges_or_data_flag: true, flag_reason: 'charges' }), source: 'gemini', model: 'm' };
    }
    return { text: JSON.stringify({ mismatches: [], charges_or_data_flag: false, flag_reason: null }), source: 'gemini', model: 'm' };
  };

  const result = await runLegalDocsReview({ sbInsert, dryRun: false, sites, fetchImpl, generate });

  assert.equal(result.reviewed, 2);
  assert.equal(result.documentsWithMismatches, 1);
  assert.equal(result.needsJbCount, 1);
  assert.ok(result.runId);

  const runRow = inserted.find((r) => r.table === 'axon_research_runs');
  assert.ok(runRow);
  assert.equal(runRow.row.lane, LEGAL_DOCS_LANE_ID);

  const busRow = inserted.find((r) => r.table === 'agent_bus');
  assert.ok(busRow);
  assert.equal(busRow.row.from_agent, 'AXON Legal Docs');
  assert.equal(busRow.row.to_agent, 'AXON Executive');
  assert.equal(busRow.row.body.needs_jb_decision.length, 1);
  assert.equal(busRow.row.body.routine_diffs.length, 0);
});

test('runLegalDocsReview respects budgetCheck and stops before the 2nd doc, never touching the 2nd site', async () => {
  const { sbInsert } = fakeSb();
  const sites = [
    { id: 'a', label: 'A', termsUrl: 'https://a/terms', privacyUrl: 'https://a/privacy' },
    { id: 'b', label: 'B', termsUrl: 'https://b/terms', privacyUrl: 'https://b/privacy' },
  ];
  // Only site "a"'s docs are stubbed — if the budget cap failed to stop the
  // run before site "b", fetchImpl would throw "no stub for https://b/terms".
  const fetchImpl = stubFetch({
    'https://a/terms': { text: '<p>t</p>' },
    'https://a/privacy': { text: '<p>p</p>' },
  });

  let processed = 0;
  const result = await runLegalDocsReview({
    sbInsert,
    dryRun: false,
    sites,
    fetchImpl,
    generate: stubGenerate(JSON.stringify({ mismatches: [], charges_or_data_flag: false })),
    budgetCheck: () => {
      const stop = processed >= 2;
      processed += 1;
      return stop;
    },
  });

  assert.equal(result.stoppedEarly, 'b:terms');
  assert.equal(result.reviewed, 2);
});

// ---------------------------------------------------------------------------
// Fixer round (COUNCIL GATE findings 1-9 on PR 303). Tests named "regression"
// fail on the code before the fix and pass after it.
// ---------------------------------------------------------------------------

const MF = { id: 'matchfit', label: 'Match Fit', termsUrl: 'https://mf/terms', privacyUrl: 'https://mf/privacy' };
const MF_TERMS = { siteId: 'matchfit', label: 'Match Fit', docType: 'terms', url: 'https://mf/terms' };
const reply = (mismatches = [], flag = false, reason = null) =>
  JSON.stringify({ mismatches, charges_or_data_flag: flag, flag_reason: reason });
const ROUTINE = { clause: 'Our trainers deliver coaching sessions.', issue: 'Defined term is Fitness Pro, not trainer.', proposed_wording: 'Our Fitness Pros deliver coaching sessions.' };
const FILLER = 'General terms apply to every user of the service. ';
/** Page text of about `total` chars with `clause` placed near char `at`. */
const page = (total, at = null, clause = '') => {
  const fill = (n) => FILLER.repeat(Math.ceil(n / FILLER.length)).slice(0, n);
  return `<p>${at === null ? fill(total) : `${fill(at)} ${clause} ${fill(total - at)}`}</p>`;
};
const pages = (map) => stubFetch(Object.fromEntries(Object.entries(map).map(([u, text]) => [u, { text }])));
/** Answers with `hit` only when the prompt contains `marker`, else a clean reply. */
const genOn = (marker, hit) => async (_k, opts) => ({ text: opts.user.includes(marker) ? hit : reply(), source: 'gemini', model: 'm' });
const liveRun = (over = {}) => {
  const sb = fakeSb();
  return runLegalDocsReview({ sbInsert: sb.sbInsert, sites: [MF], ...over }).then((r) => ({ ...r, ...sb }));
};

test('F1 regression: a contradicting clause at char ~25,000 is found (page read in windows)', async () => {
  const fetchImpl = pages({ 'https://mf/terms': page(37_654, 25_000, ROUTINE.clause) });
  const result = await reviewDocument({ doc: MF_TERMS, fetchImpl, generate: genOn('trainers deliver coaching', reply([ROUTINE])) });
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.status, 'reviewed');
  assert.equal(result.chars_reviewed, result.chars_total);
  assert.equal(result.truncated, false);
});

test('F1: splitWindows overlaps 500 chars, covers the whole page, flags a cap', () => {
  const s = lib.splitWindows('x'.repeat(20_000));
  assert.deepEqual(s.windows.map((w) => [w.start, w.end]), [[0, 8000], [7500, 15500], [15000, 20000]]);
  assert.equal(s.capped, false);
  assert.equal(lib.splitWindows('x'.repeat(80_000)).windows.length, 8);
  assert.equal(lib.splitWindows('x'.repeat(80_000)).capped, true);
});

test('F1: a clause on a window seam is reported once, not twice', async () => {
  const fetchImpl = pages({ 'https://mf/terms': page(20_000, 7_700, ROUTINE.clause) });
  const generate = genOn('trainers deliver coaching', reply([ROUTINE]));
  const calls = [];
  const result = await reviewDocument({ doc: MF_TERMS, fetchImpl, generate: async (k, o) => { calls.push(o); return generate(k, o); } });
  assert.ok(calls.filter((o) => o.user.includes('trainers deliver coaching')).length >= 2);
  assert.equal(result.mismatches.length, 1);
});

test('F1 regression: a page past the window cap is partially reviewed, never clean, and the lab-log says so', async () => {
  const fetchImpl = pages({ 'https://mf/terms': page(80_000), 'https://mf/privacy': page(500) });
  const out = await liveRun({ fetchImpl, generate: stubGenerate(reply()) });
  const terms = out.results[0];
  assert.equal(terms.status, 'partially_reviewed');
  assert.equal(terms.clean, false);
  assert.equal(terms.truncated, true);
  assert.equal(terms.windows_planned, 8);
  assert.ok(terms.chars_reviewed < terms.chars_total);
  assert.equal(out.results[1].clean, true);
  const meta = out.inserted.find((r) => r.table === 'axon_research_runs').row.meta;
  assert.equal(meta.truncated, true);
  assert.equal(meta.chars_total, terms.chars_total + out.results[1].chars_total);
  assert.ok(meta.chars_reviewed < meta.chars_total);
  assert.match(out.summary, /1 partially/);
});

test('F2 regression: a flag with no mismatches is not counted as needing JB (count matches the handoff)', async () => {
  const out = await liveRun({ fetchImpl: pages({ 'https://mf/terms': '<p>t</p>', 'https://mf/privacy': '<p>p</p>' }), generate: stubGenerate(reply([], true, 'x')) });
  assert.equal(out.needsJbCount, 0);
  assert.equal(out.inserted.some((r) => r.table === 'agent_bus'), false);
});

test('F2 regression: neither the script nor the lib can message JB, and a live run writes only the lab-log and bus rows', async () => {
  for (const f of ['scripts/axon-legal-docs-review.mjs', 'lib/axon-legal-docs-review.mjs']) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /telegram|sendToJb|jb-route/i, `${f} must not call a JB-send function`);
  }
  const out = await liveRun({ fetchImpl: pages({ 'https://mf/terms': '<p>t</p>', 'https://mf/privacy': '<p>p</p>' }), generate: stubGenerate(reply([ROUTINE], true, 'x')) });
  assert.deepEqual([...new Set(out.inserted.map((r) => r.table))].sort(), ['agent_bus', 'axon_research_runs']);
});

test('F2: every JB item carries a plain-English question for the Executive to turn into a card', async () => {
  const mm = { clause: 'Refunds within 30 days', issue: 'Product refunds within 14 days', proposed_wording: 'Refunds within 14 days' };
  const out = await liveRun({ fetchImpl: pages({ 'https://mf/terms': '<p>t</p>', 'https://mf/privacy': '<p>p</p>' }), generate: stubGenerate(reply([mm])) });
  const item = out.inserted.find((r) => r.table === 'agent_bus').row.body.needs_jb_decision[0];
  assert.match(item.question, /touches what customers are charged\. Change the wording to match, or leave it as it is\?$/);
});

test('F3 regression: flag=false on a price clause still goes to needs_jb', async () => {
  const price = { clause: 'Coaching costs $30 per month', issue: 'Product bills $40 per month', proposed_wording: 'Coaching costs $40 per month' };
  const out = await liveRun({ fetchImpl: pages({ 'https://mf/terms': '<p>t</p>', 'https://mf/privacy': '<p>p</p>' }), generate: (() => { let n = 0; return async () => ({ text: n++ === 0 ? reply([price], false) : reply(), source: 'gemini', model: 'm' }); })() });
  const body = out.inserted.find((r) => r.table === 'agent_bus').row.body;
  assert.equal(body.needs_jb_decision.length, 1);
  assert.equal(body.routine_diffs.length, 0);
  assert.equal(out.needsJbCount, 1);
});

test('F3 regression: charge, data, region and law terms route to JB whatever the model flag says', async () => {
  const cases = ['Refunds are issued in 14 days', 'Your subscription renews monthly', 'We use cookies for ads', 'Data is retained for 3 years', 'We share emails with partners',
    'Billing happens on the 1st', 'A $5 fee applies', 'This applies to users in the EU', 'Compliant with GDPR', 'See 15 U.S.C. § 45', 'We collect your location'];
  for (const text of cases) {
    const fetchImpl = pages({ 'https://mf/terms': '<p>t</p>' });
    const result = await reviewDocument({ doc: MF_TERMS, fetchImpl, generate: stubGenerate(reply([{ clause: text, issue: 'differs', proposed_wording: 'new' }], false)) });
    assert.equal(result.charges_or_data_flag, true, `"${text}" must route to JB`);
  }
});

test('F3 regression: a missing or non-boolean flag counts as true; an explicit false on a plain term stays routine', async () => {
  const run = (json) => reviewDocument({ doc: MF_TERMS, fetchImpl: pages({ 'https://mf/terms': '<p>t</p>' }), generate: stubGenerate(json) });
  assert.equal((await run(JSON.stringify({ mismatches: [ROUTINE] }))).charges_or_data_flag, true);
  assert.equal((await run(JSON.stringify({ mismatches: [ROUTINE], charges_or_data_flag: 'false' }))).charges_or_data_flag, true);
  assert.equal((await run(reply([ROUTINE], false))).charges_or_data_flag, false);
  const body = buildHandoffBody([{ skipped: false, label: 'M', docType: 'terms', mismatches: [{ clause: 'We refund within 14 days', issue: 'i', proposed_wording: 'p' }], charges_or_data_flag: false }], null);
  assert.equal(body.needs_jb_decision.length, 1);
  assert.equal(body.routine_diffs.length, 0);
});

test('F4 regression: a dry run fetches and splits only (no model call, no writes)', async () => {
  let called = 0;
  const generate = async () => { called += 1; return { text: reply(), source: 's', model: 'm' }; };
  const out = await liveRun({ dryRun: true, generate, fetchImpl: pages({ 'https://mf/terms': page(20_000), 'https://mf/privacy': '<p>p</p>' }) });
  assert.equal(called, 0);
  assert.equal(out.inserted.length, 0);
  assert.equal(out.status, 'dry_run');
  assert.equal(out.results[0].windows_planned, 3);
  assert.equal(out.reviewed, 0);
});

test('F4: the script runs a dry run end to end with only the two page fetches (no database, no JB message)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-docs-'));
  const stub = path.join(dir, 'stub.mjs');
  fs.writeFileSync(stub, "globalThis.fetch = async (u) => { console.log('FETCH ' + u); return { ok: true, status: 200, text: async () => '<p>Some terms</p>' }; };\n");
  const env = { ...process.env, AXON_DRY_RUN: '', SUPABASE_SERVICE_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' };
  const run = spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, new URL('../scripts/axon-legal-docs-review.mjs', import.meta.url).pathname, '--dry-run'], { env, encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.split('\n').filter((l) => l.startsWith('FETCH ')), ['FETCH https://match-fit.net/terms', 'FETCH https://match-fit.net/privacy']);
  assert.match(run.stdout, /dry run/);
});

test('F5 regression: 0 documents reviewed is a failed run, not a completed one, and says why in plain English', async () => {
  const out = await liveRun({ fetchImpl: pages({ 'https://mf/terms': '<p>t</p>', 'https://mf/privacy': '<p>p</p>' }), generate: failingGenerate() });
  const row = out.inserted.find((r) => r.table === 'axon_research_runs').row;
  assert.equal(out.status, 'failed');
  assert.equal(row.status, 'failed');
  assert.match(row.error_message, /Nothing was reviewed: no AI model answered\./);
  assert.match(out.summary, /Nothing was reviewed this run: no AI model answered/);
});

test('F5 regression: with no confirmed address anywhere the run is skipped, not completed', async () => {
  const out = await liveRun({ sites: [{ id: 'n', label: 'N', termsUrl: null, privacyUrl: null }], generate: stubGenerate(reply()) });
  assert.equal(out.inserted[0].row.status, 'skipped');
  assert.match(out.inserted[0].row.error_message, /no document has a confirmed live address/);
});

test('F6 regression: junk mismatch elements are dropped and the handoff still lands', async () => {
  const junk = JSON.stringify({ mismatches: [null, ROUTINE, 'text', { clause: 5 }], charges_or_data_flag: false });
  const out = await liveRun({ fetchImpl: pages({ 'https://mf/terms': '<p>t</p>', 'https://mf/privacy': '<p>p</p>' }), generate: stubGenerate(junk) });
  assert.equal(out.results[0].mismatches.length, 1);
  assert.equal(out.results[0].invalid_mismatches_dropped, 3);
  assert.ok(out.inserted.some((r) => r.table === 'agent_bus'));
  assert.doesNotThrow(() => buildDraftNote({ label: 'M', docType: 'terms', mismatches: [null, ROUTINE] }));
});

test('F6 regression: an unreadable reply is labelled as a parse failure, not "no AI cascade reachable"', async () => {
  const run = (generate) => reviewDocument({ doc: MF_TERMS, fetchImpl: pages({ 'https://mf/terms': '<p>t</p>' }), generate });
  const bad = await run(stubGenerate('sorry, no json here'));
  assert.match(bad.reason, /model reply was not valid JSON/);
  assert.doesNotMatch(bad.reason, /no AI cascade reachable/);
  assert.match((await run(stubGenerate(reply([null])))).reason, /none were usable/);
});

test('F6 regression: the model gets room for several mismatches (maxTokens >= 1600)', async () => {
  const generate = stubGenerate(reply());
  await reviewDocument({ doc: MF_TERMS, fetchImpl: pages({ 'https://mf/terms': '<p>t</p>' }), generate });
  assert.ok(generate.calls[0].opts.maxTokens >= 1600);
});

test('F6 regression: a reply cut off mid-JSON keeps the finished mismatches, is partial, and goes to JB', async () => {
  const cut = '{"mismatches":[{"clause":"We use PayOldCo","issue":"Product uses Stripe","proposed_wording":"We use Stripe"},{"clause":"Second cla';
  const result = await reviewDocument({ doc: MF_TERMS, fetchImpl: pages({ 'https://mf/terms': '<p>t</p>' }), generate: stubGenerate(cut) });
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.status, 'partially_reviewed');
  assert.equal(result.charges_or_data_flag, true);
});

test('F7 regression: fetch refuses manual-redirect hops to another site, follows www, and has a timeout', async () => {
  const seen = [];
  const hop = (location) => ({ ok: false, status: 301, headers: new Headers({ location }), text: async () => '' });
  const fetchImpl = async (url, opts) => {
    seen.push({ url, opts });
    if (url === 'https://mf/terms') return hop('https://evil.example/terms');
    if (url === 'https://mf/privacy') return hop('https://www.mf/privacy');
    return { ok: true, status: 200, text: async () => '<p>privacy</p>' };
  };
  const off = await reviewDocument({ doc: MF_TERMS, fetchImpl, generate: stubGenerate(reply()) });
  assert.match(off.reason, /off-site/);
  assert.equal(seen.some((s) => s.url.includes('evil.example')), false);
  assert.equal(seen[0].opts?.redirect, 'manual');
  assert.ok(seen[0].opts?.signal instanceof AbortSignal);
  const same = await reviewDocument({ doc: { ...MF_TERMS, docType: 'privacy', url: 'https://mf/privacy' }, fetchImpl, generate: stubGenerate(reply()) });
  assert.equal(same.status, 'reviewed');
  const slow = await reviewDocument({ doc: MF_TERMS, fetchImpl: async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); }, generate: stubGenerate(reply()) });
  assert.match(slow.reason, /timed out after 20s/);
});

test('F8/F9: the header claims only what the job does, and the script has no fake cron guard', () => {
  const lib8 = fs.readFileSync(new URL('../lib/axon-legal-docs-review.mjs', import.meta.url), 'utf8').slice(0, 1600);
  assert.doesNotMatch(lib8, /every binding document|what the codebase actually does/);
  assert.match(lib8, /does not read the codebase|What it does not do/);
  const script = fs.readFileSync(new URL('../scripts/axon-legal-docs-review.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /cronGuard|dormant:axon-legal-docs/);
  assert.match(script, /process\.exitCode = 1/);
});
