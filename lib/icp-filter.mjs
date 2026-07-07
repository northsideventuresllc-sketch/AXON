/**
 * ICP filter — 8-step refactor pipeline (Steps 3, 5, 8).
 *
 * Layers:
 *  1. Pre-scan: SERP prospect hard filter (title, snippet, link, operator patterns)
 *  2. Scan gate: LLM icp_fit boolean from gemini/haiku scan
 *  3. Post-scan: company + scan fields before drafting
 *  4. Sweep: auto-reject pending queue violations
 */
import { parseNotes, formatNotes, shortId } from './constants.mjs';
import { ICP_EXCLUSIONS } from './icp-config.mjs';
import { logOutreachAutoRejectSignal } from './outreach-learn.mjs';

/** Domains that host job listings / aggregate postings — never a direct prospect. */
export const JOB_BOARD_DOMAINS = [
  'indeed.com',
  'ziprecruiter.com',
  'glassdoor.com',
  'monster.com',
  'simplyhired.com',
  'careerbuilder.com',
  'snagajob.com',
  'tealhq.com',
  'jooble.org',
  'adzuna.com',
  'talent.com',
  'zippia.com',
  'salary.com',
  'wellfound.com',
  'dice.com',
  'flexjobs.com',
  'lensa.com',
  'jobot.com',
  'bebee.com',
  'recruiter.com',
  'startup.jobs',
  'builtin.com',
  'themuse.com',
  'lever.co',
  'greenhouse.io',
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'icims.com',
  'workable.com',
  'linkedin.com/jobs',
  'indeed.jobs',
];

const JOB_BOARD_NAMES = [
  'indeed',
  'ziprecruiter',
  'glassdoor',
  'monster.com',
  'simplyhired',
  'careerbuilder',
  'snagajob',
  'teal',
  'jooble',
  'adzuna',
  'zippia',
  'wellfound',
  'lensa',
  'jobot',
  'bebee',
  'linkedin',
];

const AGGREGATE_PATTERNS = [
  /job\s*(posting|board|listing|aggregat)/i,
  /\bjobs?\s+in\b/i,
  /\bjobs?\s+(near|hiring|available)\b/i,
  /\b(now\s+)?hiring\b/i,
  /\bcareers?\s+(page|site|at)\b/i,
  /\b\d+\s+(best|top|open)\b/i,
  /\bmultiple\s+prospects\b/i,
  /\bunknown\b/i,
  /\bapply\s+(now|today)\b/i,
  /\$\d+[\d,.]*\s*(-|to|\/|\s)\s*(hr|hour|yr|year|k\b)/i,
  /\bper\s+hour\b/i,
  /\bsalar(y|ies)\b/i,
  /\bvacanc(y|ies)\b/i,
  /\bemployment\s+opportunit/i,
];

const EXCLUSION_REGEX = ICP_EXCLUSIONS.entityTypes.map(
  (phrase) => new RegExp(phrase.replace(/\s+/g, '\\s+'), 'i')
);

function hostOf(link) {
  try {
    return new URL(link).host.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function combinedProspectText(prospect) {
  return [prospect.title, prospect.snippet, prospect.link].filter(Boolean).join(' ');
}

export function isJobBoardLink(link) {
  if (!link) return false;
  const host = hostOf(link);
  const hostPath = `${host}${(() => {
    try {
      return new URL(link).pathname;
    } catch {
      return '';
    }
  })()}`.toLowerCase();
  return JOB_BOARD_DOMAINS.some((d) =>
    d.includes('/')
      ? hostPath.startsWith(d) || hostPath.includes(d)
      : host === d || host.endsWith(`.${d}`)
  );
}

export function isJobBoardName(name) {
  const n = (name || '').toLowerCase().trim();
  if (!n) return false;
  return JOB_BOARD_NAMES.some(
    (b) => n === b || n === `${b}.com` || n.startsWith(`${b} `) || n.startsWith(`${b}.com `) || n.includes(`(${b}`)
  );
}

export function matchesAggregatePattern(text) {
  if (!text) return false;
  return AGGREGATE_PATTERNS.some((re) => re.test(text));
}

function matchesExclusionEntity(text) {
  if (!text) return false;
  if (EXCLUSION_REGEX.some((re) => re.test(text))) return true;
  return ICP_EXCLUSIONS.titlePhrases.some((phrase) => text.toLowerCase().includes(phrase));
}

function matchesOperatorAvoid(text, patterns = []) {
  const haystack = (text || '').toLowerCase();
  for (const pattern of patterns) {
    const needle = String(pattern || '').toLowerCase().trim();
    if (needle && haystack.includes(needle)) return needle;
  }
  return null;
}

/** @deprecated use preScanRejectReason */
export function jobBoardReason(prospect) {
  return preScanRejectReason(prospect);
}

/**
 * Step 3 — pre-scan hard filter on raw SERP prospect.
 */
export function preScanRejectReason(prospect, options = {}) {
  if (isJobBoardLink(prospect.link)) return `job-board domain: ${hostOf(prospect.link)}`;
  if (isJobBoardName(prospect.title)) return `job-board name: ${prospect.title}`;
  if (matchesAggregatePattern(prospect.title)) return `aggregate-post title: ${prospect.title}`;
  if (matchesAggregatePattern(prospect.snippet)) return `aggregate-post snippet: ${prospect.snippet?.slice(0, 80)}`;
  if (matchesExclusionEntity(combinedProspectText(prospect))) return `excluded entity type in SERP result`;

  const operatorHit = matchesOperatorAvoid(combinedProspectText(prospect), options.operatorAvoidPatterns);
  if (operatorHit) return `operator avoid: ${operatorHit}`;

  return null;
}

/**
 * Step 4 — scan JSON icp_fit gate.
 */
export function scanIcpRejectReason(scan) {
  if (!scan || scan.icp_fit !== false) return null;
  return scan.icp_reject_reason || 'scan icp_fit false';
}

/** @deprecated use postScanRejectReason */
export function leadRejectReason({ company, sourceLink }) {
  return postScanRejectReason({ company, sourceLink, scan: null });
}

/**
 * Step 5 — post-scan filter before drafting.
 */
export function postScanRejectReason({ company, sourceLink, scan }) {
  if (isJobBoardName(company)) return `job-board company: ${company}`;
  if (matchesAggregatePattern(company)) return `aggregate handle: ${company}`;
  if (isJobBoardLink(sourceLink)) return `job-board source: ${hostOf(sourceLink)}`;

  const scanReason = scanIcpRejectReason(scan);
  if (scanReason) return scanReason;

  if (scan?.fit_summary && matchesExclusionEntity(scan.fit_summary)) {
    return `excluded entity in fit_summary`;
  }

  return null;
}

/**
 * Step 8 — sweep pending_approval queue for ICP violations.
 */
export async function rejectPendingIcpViolations({ sbSelect, sbPatch, sbInsert }, source, { dryRun = false } = {}) {
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${source}&status=eq.pending_approval&select=id,handle,notes&limit=200`
  );

  const rejected = [];
  for (const lead of rows || []) {
    const meta = parseNotes(lead.notes);
    const reason = postScanRejectReason({
      company: lead.handle,
      sourceLink: meta.source_link,
      scan: meta.icp_scan || null,
    });
    if (!reason) continue;

    if (dryRun) {
      console.log(`[DRY RUN] would auto-reject ${shortId(lead.id)} · ${lead.handle} — ${reason}`);
    } else {
      await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, {
        status: 'dead',
        notes: formatNotes({
          ...meta,
          auto_rejected: 'icp_violation',
          auto_rejected_reason: reason,
          auto_rejected_at: new Date().toISOString(),
        }),
      });
      if (sbInsert) {
        try {
          await logOutreachAutoRejectSignal(sbInsert, lead.id, reason);
        } catch {
          /* training signal is best-effort */
        }
      }
      console.log(`Auto-rejected ${shortId(lead.id)} · ${lead.handle} — ${reason}`);
    }
    rejected.push({ id: lead.id, handle: lead.handle, reason });
  }
  return rejected;
}

/** Backward-compatible alias */
export const rejectPendingJobBoardLeads = rejectPendingIcpViolations;
