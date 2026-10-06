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
    dryRun: true,
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
