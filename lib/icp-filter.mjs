/**
 * ICP filter — auto-reject job-board / aggregator noise.
 *
 * SERP discovery queries surface a lot of job-board aggregate pages
 * (Indeed, ZipRecruiter, Teal, "25 best dental jobs in NY", …). Those are
 * not companies we can sell NI services to, but they were landing in the
 * pending_approval queue and burying real leads.
 *
 * Two layers:
 *  1. Pre-scan: drop job-board prospects before spending Gemini/Haiku calls.
 *  2. Sweep: auto-reject (status → 'dead', same as /reject) any pending
 *     leads already queued that match job-board patterns.
 */
import { parseNotes, formatNotes, shortId } from './constants.mjs';
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

/** Company-name strings that mean "this is the job board itself, not a lead". */
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

/** Phrases in a title/handle that signal an aggregate posting, not a company. */
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

function hostOf(link) {
  try {
    return new URL(link).host.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isJobBoardLink(link) {
  if (!link) return false;
  const host = hostOf(link);
  const hostPath = `${host}${(() => { try { return new URL(link).pathname; } catch { return ''; } })()}`.toLowerCase();
  return JOB_BOARD_DOMAINS.some((d) =>
    d.includes('/') ? hostPath.startsWith(d) || hostPath.includes(d) : host === d || host.endsWith(`.${d}`)
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

/**
 * Pre-scan check on a raw SERP prospect ({ title, snippet, link }).
 * Returns a reason string when it should be dropped, else null.
 */
export function jobBoardReason(prospect) {
  if (isJobBoardLink(prospect.link)) return `job-board domain: ${hostOf(prospect.link)}`;
  if (isJobBoardName(prospect.title)) return `job-board name: ${prospect.title}`;
  if (matchesAggregatePattern(prospect.title)) return `aggregate-post title: ${prospect.title}`;
  return null;
}

/**
 * Post-scan check on a scanned company / queued lead.
 * Returns a reason string when it fails ICP, else null.
 */
export function leadRejectReason({ company, sourceLink }) {
  if (isJobBoardName(company)) return `job-board company: ${company}`;
  if (matchesAggregatePattern(company)) return `aggregate handle: ${company}`;
  if (isJobBoardLink(sourceLink)) return `job-board source: ${hostOf(sourceLink)}`;
  return null;
}

/**
 * Sweep pending_approval leads and auto-reject job-board noise.
 * Sets status 'dead' (same as Telegram /reject) and records the reason in notes.
 * Returns the list of rejected leads.
 */
export async function rejectPendingJobBoardLeads({ sbSelect, sbPatch, sbInsert }, source, { dryRun = false } = {}) {
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${source}&status=eq.pending_approval&select=id,handle,notes&limit=200`
  );

  const rejected = [];
  for (const lead of rows || []) {
    const meta = parseNotes(lead.notes);
    const reason = leadRejectReason({ company: lead.handle, sourceLink: meta.source_link });
    if (!reason) continue;

    if (dryRun) {
      console.log(`[DRY RUN] would auto-reject ${shortId(lead.id)} · ${lead.handle} — ${reason}`);
    } else {
      await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, {
        status: 'dead',
        notes: formatNotes({
          ...meta,
          auto_rejected: 'icp_job_board',
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
