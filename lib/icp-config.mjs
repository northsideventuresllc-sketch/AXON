/** Structured ICP — Steps 1–2 of outreach ICP refactor. */

export const MIN_OUTREACH_SCORE = 55;

export const ICP_SEGMENTS = {
  smb: {
    label: 'SMB',
    headcount: '5–50 employees',
    roles: ['founder', 'COO', 'operations director', 'ops manager', 'office manager'],
    industries: [
      'logistics',
      'healthcare admin',
      'professional services',
      'light manufacturing',
      'property management',
      'dental practice groups',
      'freight brokerage',
      'accounting',
    ],
  },
  enterprise: {
    label: 'Enterprise',
    headcount: '50+ employees',
    roles: ['ops lead', 'compliance lead', 'COO', 'VP operations'],
    industries: ['regulated orgs', 'mid-market operations'],
  },
};

export const ICP_EXCLUSIONS = {
  entityTypes: [
    'job board',
    'recruiting agency',
    'staffing firm',
    'resume site',
    'marketplace aggregator',
    'news article',
    'directory listing',
  ],
  titlePhrases: ['recruiter', 'talent acquisition', 'headhunter', 'staffing agency'],
};

export const ICP = `
Primary (SMB): Founders/COOs of ${ICP_SEGMENTS.smb.headcount} in ops-heavy industries — ${ICP_SEGMENTS.smb.industries.join(', ')}.
Enterprise: Ops + compliance leads at regulated or mid-market orgs (${ICP_SEGMENTS.enterprise.headcount}).
Exclude: job boards, recruiting/staffing agencies, aggregate job posts, resume sites, news/listicle pages.
Voice: Underground-premium, direct, no corporate fluff. Brand: NORTHSiDE. AI partners with humans — not replaces them.
CTA: northsideintelligence.com/services
`.trim();

/** Base queries — negatives appended at search time (Step 2). */
export const SEARCH_QUERIES = [
  { query: 'small logistics company operations manual processes founder', segment: 'smb', industry: 'logistics' },
  { query: 'healthcare admin clinic workflow automation COO', segment: 'smb', industry: 'healthcare admin' },
  { query: 'professional services firm operations director small business', segment: 'smb', industry: 'professional services' },
  { query: 'manufacturing SMB digitization operations manager', segment: 'smb', industry: 'light manufacturing' },
  { query: 'property management company workflow automation founder', segment: 'smb', industry: 'property management' },
  { query: 'dental practice group operations director', segment: 'smb', industry: 'dental' },
  { query: 'freight broker back office manual processes', segment: 'smb', industry: 'freight' },
  { query: 'accounting firm operations automation partner', segment: 'smb', industry: 'accounting' },
];

const SERP_NEGATIVES = ['-jobs', '-hiring', '-"job board"', '-indeed', '-ziprecruiter', '-glassdoor', '-recruiter'];

export function serpQueryWithNegatives(baseQuery) {
  return `${baseQuery} ${SERP_NEGATIVES.join(' ')}`.trim();
}

export function pickQueriesForDay(dayIndex = new Date().getUTCDay()) {
  const primary = SEARCH_QUERIES[dayIndex % SEARCH_QUERIES.length];
  const secondary = SEARCH_QUERIES[(dayIndex + 3) % SEARCH_QUERIES.length];
  return [primary, secondary].map((entry) => ({
    ...entry,
    searchQuery: serpQueryWithNegatives(entry.query),
  }));
}

export const SCORE_RUBRIC = `
Score 0-100 using this rubric:
- Industry fit (0-30): ops-heavy SMB/enterprise in target industries
- Pain clarity (0-25): specific manual workflow / compliance / scaling pain
- Contactability (0-20): inferrable business email or LinkedIn path
- Size fit (0-15): 5-50 SMB or credible mid-market enterprise signal
- Exclusion penalty: job-board/recruiter/aggregator → score 0, do not draft
Minimum to queue: ${MIN_OUTREACH_SCORE}
`.trim();
