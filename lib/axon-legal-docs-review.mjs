/**
 * AXON Legal Docs — fetches the live Terms of Service and Privacy Policy pages
 * that have a confirmed address (today only Match Fit), reads each page in
 * overlapping windows through the one locked model chain, and flags clauses
 * that disagree with the short fact list handed to the run
 * (DEFAULT_PRODUCT_FACTS). Findings go to the AXON Executive over agent_bus
 * with a drafted wording per document.
 *
 * What it does not do: read the codebase or NI-Brain Decisions, cover refund,
 * agreement or cookie documents, write a review row per document, or remember
 * earlier findings. It never opens a PR and never messages anyone, JB
 * included: the Executive reads the bus row and routes any JB card, and a
 * failed lab-log row is how a failed run shows up.
 *
 * Routing to a JB decision does not rely on the model alone. A mismatch goes
 * to JB when the model says so, when its flag is missing or not a boolean, or
 * when the clause, issue or proposed wording touches charges, data, regions or
 * a cited law (see sensitiveTopics). A page is only called clean when every
 * part of it was read; a capped or partly unreadable page is reported as
 * partially reviewed.
 *
 * Logic lives here, split from the CLI entrypoint
 * (scripts/axon-legal-docs-review.mjs), same split as
 * lib/axon-ui-copy-review.mjs so it stays unit-testable offline.
 */
import { generateViaRouter } from './axon-generate.mjs';
import { writeResearchRunLabLog } from './axon-research-core.mjs';
import { AGENT } from './agent-names.mjs';
import { handoffToAgent } from './axon-agent-comms.mjs';

export const LEGAL_DOCS_LANE_ID = 'legal_docs_review';

export const DOC_TYPES = ['terms', 'privacy'];

/**
 * Sites this job reads, per the roster spec. Only `matchfit` has a
 * JB-confirmed live domain (match-fit.net) with the exact paths named in
 * the roster note. The others are named in the spec but have no confirmed
 * live URL anywhere in the vault yet — leaving those null (not guessed)
 * means the run reports them as an honest skip instead of fabricating a
 * domain that could 404 or, worse, hit the wrong site.
 */
export const DEFAULT_SITES = [
  { id: 'matchfit', label: 'Match Fit', termsUrl: 'https://match-fit.net/terms', privacyUrl: 'https://match-fit.net/privacy' },
  { id: 'northside-intelligence', label: 'Northside Intelligence', termsUrl: null, privacyUrl: null },
  { id: 'streampass', label: 'Stream Pass', termsUrl: null, privacyUrl: null },
  { id: 'nsss', label: 'NSSS', termsUrl: null, privacyUrl: null },
];

/**
 * What the product actually does today, per the roster spec's "Reads"
 * section. This is a seam (override via the `productFacts` param) — SENSEI
 * or JB should keep it current as payment flows / data flows change rather
 * than have this job guess at them from the codebase each run.
 */
export const DEFAULT_PRODUCT_FACTS = [
  'Payment flows: Stripe (checkout + subscriptions).',
  'Email delivery: two separate Resend accounts.',
  'Auth: Supabase Auth.',
  'Defined product terms: "Fitness Pro" (Match Fit coach tier), "Match Fit", "Northside".',
].join('\n');

/** Each page is read in windows of this size, overlapping so a clause on a seam is whole in one. */
export const WINDOW_CHARS = 8000;
export const WINDOW_OVERLAP = 500;
/** Most windows read per document. Live match-fit.net/terms needs 5; beyond the cap the page is partial. */
export const MAX_WINDOWS = 8;
const MAX_TOKENS = 1600;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/** Strip tags/scripts from a fetched HTML page down to plain-ish text for the prompt. */
export function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build the flat list of {site, docType, url} entries this run will attempt. */
export function listLegalDocs(sites = DEFAULT_SITES) {
  const out = [];
  for (const site of sites) {
    for (const docType of DOC_TYPES) {
      const url = docType === 'terms' ? site.termsUrl : site.privacyUrl;
      out.push({ siteId: site.id, label: site.label, docType, url });
    }
  }
  return out;
}

/** Split page text into overlapping windows, at most `maxWindows`. `capped` = the page needs more. */
export function splitWindows(text, { size = WINDOW_CHARS, overlap = WINDOW_OVERLAP, maxWindows = MAX_WINDOWS } = {}) {
  const total = text.length;
  const step = Math.max(1, size - overlap);
  const windows = [];
  let start = 0;
  while (start < total && windows.length < maxWindows) {
    const end = Math.min(start + size, total);
    windows.push({ start, end, text: text.slice(start, end) });
    if (end >= total) break;
    start += step;
  }
  const planned = windows.length ? windows[windows.length - 1].end : 0;
  return { windows, chars_total: total, capped: planned < total };
}

function unionLength(spans) {
  let sum = 0;
  let curEnd = -1;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const from = Math.max(s.start, curEnd);
    if (s.end > from) sum += s.end - from;
    curEnd = Math.max(curEnd, s.end);
  }
  return sum;
}

const REVIEW_SYSTEM =
  'You are AXON Legal Docs — you compare a live legal page against known product facts for ' +
  'Northside Ventures (NVG) and flag only clauses that directly disagree with those facts. ' +
  'Never invent a legal obligation, never cite a law you were not given, and never flag a ' +
  'clause just because it is vague — only flag a real, checkable mismatch. If a change would ' +
  'affect what a customer is charged or what data is collected, say so plainly so it can be ' +
  'routed to a human decision instead of an automatic draft. Return JSON only.';

const docName = (docType) => (docType === 'terms' ? 'Terms of Service' : 'Privacy Policy');

/** `part` = { index, count, start, end, total } when the page is read in windows. */
export function buildReviewPrompt(doc, liveText, productFacts, part = null) {
  const heading = part
    ? `Live document text (part ${part.index} of ${part.count}, characters ${part.start + 1}-${part.end} of ${part.total}).\n` +
      'Other parts are read separately; ignore a clause cut off at the very start or end of this part:'
    : 'Live document text:';
  return `Site: ${doc.label}
Document: ${docName(doc.docType)}
URL: ${doc.url}

Known product facts (treat as ground truth for this run):
${productFacts}

${heading}
${liveText}

Find clauses in the live document that disagree with the known product facts above — for
example a payment processor, data recipient, or defined term that no longer matches. Leave
"mismatches" empty if nothing disagrees — most runs should find nothing new.

Return JSON:
{
  "mismatches": [
    { "clause": "the exact or closely-paraphrased clause", "issue": "one sentence — what disagrees and why", "proposed_wording": "the corrected clause text" }
  ],
  "charges_or_data_flag": false,
  "flag_reason": null
}

Set "charges_or_data_flag" true only when a mismatch means a customer would be charged
differently or different data would be collected than the live document currently says —
that case needs a human decision, not an automatic draft, so say why in "flag_reason".`;
}

function stripFences(text) {
  return String(text || '').replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
}

function extractJson(text) {
  const match = stripFences(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

/** Reply cut off mid-JSON: keep the mismatch objects that closed cleanly, or null if none did. */
function salvageMismatches(text) {
  const s = stripFences(text);
  const at = s.search(/"mismatches"\s*:\s*\[/);
  if (at < 0) return null;
  const items = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;
  for (let i = s.indexOf('[', at) + 1; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        try { items.push(JSON.parse(s.slice(objStart, i + 1))); } catch { /* skip a broken object */ }
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return items.length ? { mismatches: items } : null;
}

/** Keep only mismatch elements that are objects with a clause and an issue; coerce fields to strings. */
export function normalizeMismatches(raw) {
  const valid = [];
  let dropped = 0;
  for (const m of Array.isArray(raw) ? raw : []) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) { dropped += 1; continue; }
    const clause = typeof m.clause === 'string' ? m.clause.trim() : '';
    const issue = typeof m.issue === 'string' ? m.issue.trim() : '';
    if (!clause || !issue) { dropped += 1; continue; }
    valid.push({ clause, issue, proposed_wording: typeof m.proposed_wording === 'string' ? m.proposed_wording.trim() : '' });
  }
  return { valid, dropped };
}

/** Merge per-window findings, dropping repeats (the 500-char overlap shows one clause twice). */
export function mergeMismatches(lists) {
  const out = [];
  const keys = [];
  for (const m of lists.flat()) {
    const k = m.clause.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const dup = keys.some((o) => o === k || (Math.min(o.length, k.length) >= 25 && (o.includes(k) || k.includes(o))));
    if (dup) continue;
    keys.push(k);
    out.push(m);
  }
  return out;
}

/** Parse one window's model reply. Throws a plain-labelled Error when the reply is unusable. */
function readWindowReply(text) {
  let parsed;
  let replyTruncated = false;
  try {
    parsed = extractJson(text);
  } catch (err) {
    parsed = salvageMismatches(text);
    if (!parsed) throw new Error(`model reply was not valid JSON: ${err.message}`);
    replyTruncated = true;
  }
  if (!Array.isArray(parsed.mismatches)) throw new Error('model reply had no mismatches list');
  const { valid, dropped } = normalizeMismatches(parsed.mismatches);
  if (parsed.mismatches.length > 0 && valid.length === 0) throw new Error('model reply listed mismatches but none were usable');
  // A missing or non-boolean flag counts as true: only an explicit false means "routine".
  const flag = valid.length > 0 && (typeof parsed.charges_or_data_flag === 'boolean' ? parsed.charges_or_data_flag : true);
  const flagReason = typeof parsed.flag_reason === 'string' && parsed.flag_reason.trim() ? parsed.flag_reason.trim() : null;
  return { mismatches: valid, dropped, flag, flagReason, replyTruncated };
}

/**
 * Deterministic backstop for "charges or data collection goes to JB". Returns the plain-English topics
 * a mismatch touches; any hit routes the document to a JB decision whatever the model's own flag says.
 */
const SENSITIVE_TERMS = [
  ['what customers are charged', /\b(?:charge[sd]?|charging|prices?|priced|pricing|fees?|refunds?|refunded|subscriptions?|subscribe[sd]?|billing|billed|payments?|pay(?:s|ing)?|paid|invoices?|renewals?|cancell?ations?)\b|[$€£]\s?\d/i],
  ['what data is collected, kept or shared', /\b(?:data[- ]collect\w*|collect(?:s|ed|ing|ion)?|personal (?:data|information)|retain(?:s|ed|ing)?|retention|stor(?:e|es|ed|ing|age)|shar(?:e|es|ed|ing)|third[- ]part(?:y|ies)|sell|sells|sold|cookies?|tracking|analytics|recipients?|processors?|service providers?|stripe|resend|supabase)\b/i],
  ['which region\'s rules apply', /\b(?:regions?|jurisdictions?|countr(?:y|ies)|territor(?:y|ies)|EU|EEA|Europe(?:an)?|UK|United Kingdom|California|Canada|Australia|international|cross-border|governing law)\b/i],
  ['a cited law', /\b(?:GDPR|CCPA|CPRA|COPPA|HIPAA|FERPA|PIPEDA|LGPD|CAN-SPAM|TCPA|ePrivacy)\b|§|\b\d+\s+U\.?S\.?C\b|\b\d+\s+C\.?F\.?R\b/i],
];

export function sensitiveTopics(mismatch) {
  const text = [mismatch?.clause, mismatch?.issue, mismatch?.proposed_wording].filter((t) => typeof t === 'string').join('\n');
  return SENSITIVE_TERMS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

/** One rule for "goes to JB", used for the handoff and the count alike. Missing/non-boolean flag = true. */
export function routesToJb(result) {
  const list = Array.isArray(result?.mismatches) ? result.mismatches : [];
  return result?.charges_or_data_flag !== false || list.some((m) => sensitiveTopics(m).length > 0);
}

function jbTopics(result) {
  return [...new Set((result.mismatches || []).flatMap(sensitiveTopics))];
}

function jbReason(result) {
  if (result.flagReason) return result.flagReason;
  const topics = jbTopics(result);
  return topics.length ? `This wording touches ${topics.join('; ')}.` : 'The model could not rule out a change to charges or data collection.';
}

function jbQuestion(result) {
  const topics = jbTopics(result);
  return `${result.label} ${docName(result.docType)}: the wording disagrees with the product on something that touches ` +
    `${topics.length ? topics.join('; ') : 'what customers are charged or what data is collected'}. Change the wording to match, or leave it as it is?`;
}

const SKIP_WHY = {
  no_url: 'no document has a confirmed live address yet',
  fetch: 'the live page could not be loaded',
  empty: 'the page had no readable text',
  chain: 'no AI model answered',
  parse: 'the model\'s answer could not be read',
};

/**
 * Fetch one page: same-site redirects only (apex and www count as one site), same scheme, 20s cap.
 * An off-site redirect is refused before it is fetched.
 */
async function fetchLegalPage(url, fetchImpl) {
  const site = (u) => u.host.replace(/^www\./, '');
  const origin = new URL(url);
  let current = origin;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchImpl(current.toString(), { redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers?.get?.('location');
      if (!loc) throw new Error(`HTTP ${res.status} redirect with no Location`);
      const next = new URL(loc, current);
      if (next.protocol !== origin.protocol || site(next) !== site(origin)) throw new Error(`redirected off-site to ${next.host} (not fetched)`);
      current = next;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return stripHtml(await res.text());
  }
  throw new Error('too many redirects');
}

/**
 * Review one document: fetch the live page, read it in overlapping windows, compare each against product
 * facts via the one locked model chain, merge the findings. Never fabricates a mismatch when the URL is
 * unconfirmed, the fetch fails, or the model cascade is unreachable — each of those is an honest skip.
 * `status` is 'reviewed' only when every part of the page was read; otherwise 'partially_reviewed'.
 * In a dry run the page is fetched and split, and nothing else happens (no model call).
 */
export async function reviewDocument({
  doc,
  productFacts = DEFAULT_PRODUCT_FACTS,
  supabaseKey,
  fetchImpl = fetch,
  generate = generateViaRouter,
  dryRun = false,
  budgetCheck = () => false,
}) {
  const base = {
    siteId: doc.siteId, label: doc.label, docType: doc.docType, url: doc.url,
    status: 'skipped', skip_kind: null, clean: false, mismatches: [], invalid_mismatches_dropped: 0,
    charges_or_data_flag: false, flagReason: null,
    chars_total: 0, chars_reviewed: 0, truncated: false,
    windows_planned: 0, windows_reviewed: 0, windows_capped: false, partial_reasons: [],
  };
  const skip = (skip_kind, reason, provider, extra = {}) => ({ ...base, ...extra, skipped: true, skip_kind, reason, _provider: provider });

  if (!doc.url) return skip('no_url', 'no confirmed live URL configured for this site/document', 'skipped');

  let liveText;
  try {
    liveText = await fetchLegalPage(doc.url, fetchImpl);
  } catch (err) {
    return skip('fetch', `fetch failed: ${err.name === 'TimeoutError' ? `timed out after ${FETCH_TIMEOUT_MS / 1000}s` : err.message}`, 'error');
  }
  if (!liveText) return skip('empty', 'fetched page had no readable text', 'error');

  const plan = splitWindows(liveText);
  const n = plan.windows.length;
  const seen = { chars_total: plan.chars_total, windows_planned: n, windows_capped: plan.capped, truncated: true };
  if (dryRun) {
    return skip('dry_run', `dry run: ${plan.chars_total} chars fetched, split into ${n} window(s)${plan.capped ? ' (page longer than the cap)' : ''}; nothing sent to a model`, 'dry-run', { ...seen, status: 'dry_run' });
  }

  const readSpans = [];
  const found = [];
  const failures = [];
  const partial = [];
  const flagReasons = [];
  let modelFlag = false;
  let dropped = 0;
  let usable = 0;
  let provider = null;
  let model = null;

  for (let i = 0; i < n; i++) {
    if (i > 0 && budgetCheck()) { partial.push(`time budget reached before part ${i + 1} of ${n}`); break; }
    const w = plan.windows[i];
    let out;
    try {
      out = await generate(supabaseKey, {
        system: REVIEW_SYSTEM,
        user: buildReviewPrompt(doc, w.text, productFacts, { index: i + 1, count: n, start: w.start, end: w.end, total: plan.chars_total }),
        kind: 'reasoning_planning',
        agentName: 'axon-legal-docs',
        maxTokens: MAX_TOKENS,
        jsonMode: true,
      });
    } catch (err) {
      failures.push({ kind: 'chain', message: `no AI cascade reachable: ${err.message}` });
      partial.push(`part ${i + 1} of ${n} not read: no AI model answered`);
      break; // the chain is down; the remaining parts would fail the same way
    }
    let reply;
    try {
      reply = readWindowReply(out?.text);
    } catch (err) {
      failures.push({ kind: 'parse', message: err.message });
      partial.push(`part ${i + 1} of ${n} not read: the model's answer could not be read`);
      continue;
    }
    usable += 1;
    provider = out.source;
    model = out.model;
    dropped += reply.dropped;
    found.push(reply.mismatches);
    if (reply.flag) { modelFlag = true; if (reply.flagReason) flagReasons.push(reply.flagReason); }
    if (reply.replyTruncated) partial.push(`part ${i + 1} of ${n}: the model's answer was cut off, some findings may be missing`);
    else readSpans.push({ start: w.start, end: w.end });
  }

  if (usable === 0) {
    const kind = failures.some((f) => f.kind === 'chain') ? 'chain' : 'parse';
    return skip(kind, [...new Set(failures.map((f) => f.message))].join('; ') || 'no part of the page could be read', kind === 'chain' ? 'heuristic' : 'error', seen);
  }

  const chars_reviewed = unionLength(readSpans);
  const truncated = chars_reviewed < plan.chars_total;
  if (plan.capped) partial.unshift(`page is longer than the ${MAX_WINDOWS}-part cap: read ${chars_reviewed} of ${plan.chars_total} characters`);
  const mismatches = mergeMismatches(found);
  const draft = { label: doc.label, docType: doc.docType, mismatches };
  const topics = jbTopics(draft);
  const needsJb = modelFlag || topics.length > 0;
  const status = truncated ? 'partially_reviewed' : 'reviewed';
  return {
    ...base,
    ...seen,
    skipped: false,
    status,
    clean: status === 'reviewed' && mismatches.length === 0,
    mismatches,
    invalid_mismatches_dropped: dropped,
    charges_or_data_flag: needsJb,
    flagReason: needsJb ? [flagReasons[0], topics.length ? `This wording touches ${topics.join('; ')}.` : null].filter(Boolean).join(' ') || jbReason(draft) : null,
    chars_reviewed,
    truncated,
    windows_reviewed: readSpans.length,
    partial_reasons: partial,
    _provider: provider,
    _model: model,
  };
}

/** One plain-English draft note per reviewed document that found mismatches. */
export function buildDraftNote(result) {
  const list = (Array.isArray(result?.mismatches) ? result.mismatches : []).filter((m) => m && typeof m === 'object');
  const lines = list.map((m, i) => `${i + 1}. Clause: ${m.clause ?? ''}\n   Issue: ${m.issue ?? ''}\n   Proposed: ${m.proposed_wording ?? ''}`);
  return `${result.label} — ${result.docType}: ${list.length} mismatch(es) found.\n${lines.join('\n')}`;
}

const coverageEntry = (r) => ({
  site: r.label, doc: r.docType, status: r.status, chars_total: r.chars_total, chars_reviewed: r.chars_reviewed, truncated: r.truncated,
});

/** Build the agent_bus body handed to the AXON Executive. */
export function buildHandoffBody(results, stoppedEarly) {
  const reviewed = results.filter((r) => !r.skipped);
  const withMismatches = reviewed.filter((r) => r.mismatches.length);
  const needsJbDecision = withMismatches.filter(routesToJb);
  const routineDiffs = withMismatches.filter((r) => !routesToJb(r));

  return {
    kind: LEGAL_DOCS_LANE_ID,
    date: new Date().toISOString().slice(0, 10),
    stopped_early_at: stoppedEarly,
    documents_reviewed: reviewed.length,
    documents_partially_reviewed: reviewed.filter((r) => r.status === 'partially_reviewed').length,
    documents_with_mismatches: withMismatches.length,
    coverage: results.map(coverageEntry),
    needs_jb_decision: needsJbDecision.map((r) => ({ site: r.label, doc: r.docType, draft: buildDraftNote(r), reason: jbReason(r), question: jbQuestion(r) })),
    routine_diffs: routineDiffs.map((r) => ({ site: r.label, doc: r.docType, draft: buildDraftNote(r) })),
    instructions:
      'Routine diffs: BUILD opens a PR in the owning repo with this wording, then calls ' +
      'requestCouncilGateReview before merge — this job never opens a PR itself. ' +
      'needs_jb_decision items touch charges, data collection, a region or a cited law (or the ' +
      'model could not rule it out): turn each one\'s question into a JB approval card and do ' +
      'not open a PR until JB approves. A document marked partially_reviewed in coverage is ' +
      'not clean: the part that was not read still needs a review.',
  };
}

function runStatus({ dryRun, fetched, reviewed, attempted }) {
  if (dryRun && fetched > 0) return 'dry_run';
  if (!dryRun && reviewed > 0) return 'completed';
  return attempted > 0 ? 'failed' : 'skipped';
}

/**
 * Run the legal docs review across every configured site/document, write a
 * lab-log run row, and hand real findings off to the AXON Executive.
 * `fetchImpl` and `generate` are injectable seams so tests never touch the
 * network or a live model. `status` is 'completed' only when at least one
 * document was reviewed; 'failed'/'skipped' mean nothing was (callers exit
 * non-zero). A dry run fetches and splits only: no model call, no writes.
 */
export async function runLegalDocsReview({
  sbInsert,
  supabaseKey,
  generate = generateViaRouter,
  fetchImpl = fetch,
  dryRun = false,
  operatorId = 'default',
  now = new Date(),
  budgetCheck = () => false,
  sites = DEFAULT_SITES,
  productFacts = DEFAULT_PRODUCT_FACTS,
}) {
  const docs = listLegalDocs(sites);

  const results = [];
  let stoppedEarly = null;

  for (const doc of docs) {
    if (budgetCheck()) {
      stoppedEarly = `${doc.siteId}:${doc.docType}`;
      break;
    }
    results.push(await reviewDocument({ doc, productFacts, supabaseKey, fetchImpl, generate, dryRun, budgetCheck }));
  }

  const reviewedDocs = results.filter((r) => !r.skipped);
  const fullyReviewed = reviewedDocs.filter((r) => r.status === 'reviewed').length;
  const withMismatches = reviewedDocs.filter((r) => r.mismatches.length);
  const totalMismatches = withMismatches.reduce((sum, r) => sum + r.mismatches.length, 0);
  const documentsWithMismatches = withMismatches.length;
  // Same set the handoff uses: a flag on a document with no mismatches has nothing behind it.
  const needsJbCount = withMismatches.filter(routesToJb).length;
  const attempted = results.filter((r) => r.url).length;
  const fetched = results.filter((r) => r.chars_total > 0).length;
  const status = runStatus({ dryRun, fetched, reviewed: reviewedDocs.length, attempted });
  const why = [...new Set(results.filter((r) => r.skipped && r.skip_kind !== 'dry_run').map((r) => SKIP_WHY[r.skip_kind]))];
  const whyNothing = stoppedEarly && !attempted ? 'the time budget ran out before the first document' : (attempted ? why.filter((w) => w !== SKIP_WHY.no_url) : [SKIP_WHY.no_url]).join(', ');
  const total = (key) => results.reduce((sum, r) => sum + r[key], 0);

  const summary = dryRun
    ? `AXON Legal Docs dry run: ${reviewedDocs.length}/${docs.length} document(s) reviewed — pages fetched and split only, ` +
      `nothing sent to a model, nothing written (${fetched} page(s) fetched, ${total('windows_planned')} window(s))` +
      (stoppedEarly ? `, stopped before "${stoppedEarly}" (time budget)` : '') + '.'
    : `AXON Legal Docs review: ${reviewedDocs.length}/${docs.length} document(s) reviewed ` +
      `(${fullyReviewed} in full, ${reviewedDocs.length - fullyReviewed} partially), ${reviewedDocs.filter((r) => r.clean).length} clean, ` +
      `${documentsWithMismatches} with mismatches (${totalMismatches} total, ${needsJbCount} need a JB decision)` +
      (stoppedEarly ? `, stopped before "${stoppedEarly}" (time budget)` : '') +
      '.' + (reviewedDocs.length === 0 ? ` Nothing was reviewed this run: ${whyNothing}.` : '');

  let runId = null;
  if (!dryRun) {
    const runRow = await writeResearchRunLabLog(sbInsert, {
      operatorId,
      lane: LEGAL_DOCS_LANE_ID,
      findingsCount: totalMismatches,
      briefingItemsAdded: 0,
      status,
      errorMessage: status === 'completed' ? null : `Nothing was reviewed: ${whyNothing}.`,
      summary,
      meta: {
        documents_total: docs.length,
        documents_reviewed: reviewedDocs.length,
        documents_fully_reviewed: fullyReviewed,
        documents_partially_reviewed: reviewedDocs.length - fullyReviewed,
        documents_with_mismatches: documentsWithMismatches,
        needs_jb_decision_count: needsJbCount,
        stopped_early_at: stoppedEarly,
        chars_total: total('chars_total'),
        chars_reviewed: total('chars_reviewed'),
        invalid_mismatches_dropped: total('invalid_mismatches_dropped'),
        truncated: results.some((r) => r.url && r.truncated),
        coverage: results.map(coverageEntry),
      },
    }).catch((err) => {
      console.log(`⚠️ lab-log write failed: ${err.message}`);
      return null;
    });
    runId = runRow?.id || null;

    if (documentsWithMismatches > 0) {
      await handoffToAgent(sbInsert, {
        fromAgent: AGENT.LEGAL_DOCS,
        toAgent: AGENT.EXECUTIVE_AGENT,
        subject: `LEGAL-DOCS-REVIEW-${now.toISOString().slice(0, 10).replace(/-/g, '')}`,
        body: buildHandoffBody(results, stoppedEarly),
        needsAnswer: true,
      });
    }
  }

  return { results, reviewed: reviewedDocs.length, documentsWithMismatches, totalMismatches, needsJbCount, stoppedEarly, summary, runId, status };
}

/** Best-effort failed lab-log row for an unexpected crash, so the failure shows up without messaging anyone. */
export async function recordLegalDocsFailure(sbInsert, err, { operatorId = 'default' } = {}) {
  try {
    return await writeResearchRunLabLog(sbInsert, {
      operatorId,
      lane: LEGAL_DOCS_LANE_ID,
      status: 'failed',
      errorMessage: 'AXON Legal Docs stopped with an unexpected error before it finished.',
      meta: { technical_error: String(err?.message || err).slice(0, 500) },
    });
  } catch (writeErr) {
    console.log(`⚠️ failed-run lab-log write failed: ${writeErr.message}`);
    return null;
  }
}
