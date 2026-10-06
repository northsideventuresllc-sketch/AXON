/**
 * AXON Legal Docs — checks every binding document (Terms of Service,
 * Privacy Policy, and friends) against what the codebase actually does,
 * drafts an update when they disagree, and hands the draft to the AXON
 * Executive for routing (BUILD opens the PR + requests the real council
 * review once a diff actually exists — this job never opens a PR itself).
 *
 * JB turned the roster row on 2026-10-06 (IU2-AXON-LEGAL-1006) with no
 * script behind it yet. Logic lives here, split from the CLI entrypoint
 * (scripts/axon-legal-docs-review.mjs), same split as
 * lib/axon-ui-copy-review.mjs so it stays unit-testable offline.
 *
 * Per 00_Command_Center/Agents/AXON Legal Docs.md this job must never:
 * publish/merge a legal change itself, change what a customer is charged
 * or what data is collected without a JB decision brief, or cite a law it
 * did not verify this run. Mismatches get a drafted diff, not a citation —
 * the model is told to flag only what the live text and the given product
 * facts directly disagree on.
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

const MAX_DOC_CHARS = 8000;

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

const REVIEW_SYSTEM =
  'You are AXON Legal Docs — you compare a live legal page against known product facts for ' +
  'Northside Ventures (NVG) and flag only clauses that directly disagree with those facts. ' +
  'Never invent a legal obligation, never cite a law you were not given, and never flag a ' +
  'clause just because it is vague — only flag a real, checkable mismatch. If a change would ' +
  'affect what a customer is charged or what data is collected, say so plainly so it can be ' +
  'routed to a human decision instead of an automatic draft. Return JSON only.';

export function buildReviewPrompt(doc, liveText, productFacts) {
  return `Site: ${doc.label}
Document: ${doc.docType === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
URL: ${doc.url}

Known product facts (treat as ground truth for this run):
${productFacts}

Live document text (truncated to ${MAX_DOC_CHARS} chars):
${liveText.slice(0, MAX_DOC_CHARS)}

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

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

/**
 * Review one document: fetch the live page, compare against product facts
 * via the one locked model chain. Never fabricates a mismatch when the URL
 * is unconfirmed, the fetch fails, or the model cascade is unreachable —
 * each of those is an honest skip, not an invented finding.
 */
export async function reviewDocument({ doc, productFacts = DEFAULT_PRODUCT_FACTS, supabaseKey, fetchImpl = fetch, generate = generateViaRouter }) {
  const base = { siteId: doc.siteId, label: doc.label, docType: doc.docType, url: doc.url, mismatches: [], charges_or_data_flag: false, flagReason: null };

  if (!doc.url) {
    return { ...base, skipped: true, reason: 'no confirmed live URL configured for this site/document', _provider: 'skipped' };
  }

  let liveText;
  try {
    const res = await fetchImpl(doc.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    liveText = stripHtml(await res.text());
  } catch (err) {
    return { ...base, skipped: true, reason: `fetch failed: ${err.message}`, _provider: 'error' };
  }

  if (!liveText) {
    return { ...base, skipped: true, reason: 'fetched page had no readable text', _provider: 'error' };
  }

  try {
    const out = await generate(supabaseKey, {
      system: REVIEW_SYSTEM,
      user: buildReviewPrompt(doc, liveText, productFacts),
      kind: 'reasoning_planning',
      agentName: 'axon-legal-docs',
      maxTokens: 900,
      jsonMode: true,
    });
    const parsed = extractJson(out.text);
    return {
      ...base,
      mismatches: Array.isArray(parsed.mismatches) ? parsed.mismatches : [],
      charges_or_data_flag: Boolean(parsed.charges_or_data_flag),
      flagReason: parsed.flag_reason || null,
      skipped: false,
      _provider: out.source,
      _model: out.model,
    };
  } catch (err) {
    return { ...base, skipped: true, reason: `no AI cascade reachable: ${err.message}`, _provider: 'heuristic' };
  }
}

/** One plain-English draft note per reviewed document that found mismatches. */
export function buildDraftNote(result) {
  const lines = result.mismatches.map(
    (m, i) => `${i + 1}. Clause: ${m.clause}\n   Issue: ${m.issue}\n   Proposed: ${m.proposed_wording}`
  );
  return `${result.label} — ${result.docType}: ${result.mismatches.length} mismatch(es) found.\n${lines.join('\n')}`;
}

/** Build the agent_bus body handed to the AXON Executive. */
export function buildHandoffBody(results, stoppedEarly) {
  const reviewed = results.filter((r) => !r.skipped);
  const withMismatches = reviewed.filter((r) => r.mismatches.length);
  const needsJbDecision = withMismatches.filter((r) => r.charges_or_data_flag);
  const routineDiffs = withMismatches.filter((r) => !r.charges_or_data_flag);

  return {
    kind: LEGAL_DOCS_LANE_ID,
    date: new Date().toISOString().slice(0, 10),
    stopped_early_at: stoppedEarly,
    documents_reviewed: reviewed.length,
    documents_with_mismatches: withMismatches.length,
    needs_jb_decision: needsJbDecision.map((r) => ({ site: r.label, doc: r.docType, draft: buildDraftNote(r), reason: r.flagReason })),
    routine_diffs: routineDiffs.map((r) => ({ site: r.label, doc: r.docType, draft: buildDraftNote(r) })),
    instructions:
      'Routine diffs: BUILD opens a PR in the owning repo with this wording, then calls ' +
      'requestCouncilGateReview before merge — this job never opens a PR itself. ' +
      'needs_jb_decision items change charges or data collection: file a JB decision brief ' +
      'and do not open a PR until JB approves.',
  };
}

/**
 * Run the legal docs review across every configured site/document, write a
 * lab-log run row, and hand real findings off to the AXON Executive.
 * `fetchImpl` and `generate` are injectable seams so tests never touch the
 * network or a live model.
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
    const result = await reviewDocument({ doc, productFacts, supabaseKey, fetchImpl, generate });
    results.push(result);
  }

  const reviewed = results.filter((r) => !r.skipped);
  const totalMismatches = reviewed.reduce((sum, r) => sum + r.mismatches.length, 0);
  const documentsWithMismatches = reviewed.filter((r) => r.mismatches.length).length;
  const needsJbCount = reviewed.filter((r) => r.charges_or_data_flag).length;

  const summary =
    `AXON Legal Docs review: ${reviewed.length}/${docs.length} document(s) reviewed, ` +
    `${documentsWithMismatches} with mismatches (${totalMismatches} total, ${needsJbCount} need a JB decision)` +
    (stoppedEarly ? `, stopped before "${stoppedEarly}" (time budget)` : '') +
    '.';

  let runId = null;
  if (!dryRun) {
    const runRow = await writeResearchRunLabLog(sbInsert, {
      operatorId,
      lane: LEGAL_DOCS_LANE_ID,
      findingsCount: totalMismatches,
      briefingItemsAdded: 0,
      status: 'completed',
      summary,
      meta: {
        documents_total: docs.length,
        documents_reviewed: reviewed.length,
        documents_with_mismatches: documentsWithMismatches,
        needs_jb_decision_count: needsJbCount,
        stopped_early_at: stoppedEarly,
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

  return { results, reviewed: reviewed.length, documentsWithMismatches, totalMismatches, needsJbCount, stoppedEarly, summary, runId };
}
