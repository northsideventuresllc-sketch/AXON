export const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
export const SOURCE = 'axon_ni_services';
export const MAX_DRAFTS_PER_DAY = 15;
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

export const SERVICES_CATALOG = `
SMB ($4,500–$15,000):
- Workflow Integration & Automation
- Intelligence Audit & Gap Analysis
- Team Intelligence Training

Enterprise ($12,000–$100,000+):
- Tailored Intelligence Server
- Enterprise AI Strategy
- AI Governance & Compliance Framework
`.trim();

export const ICP = `
Primary: Founders/COOs of 5–50 person SMBs in ops-heavy industries (logistics, healthcare admin, professional services, light manufacturing).
Enterprise: Ops + compliance leads at regulated or mid-market orgs.
Voice: Underground-premium, direct, no corporate fluff. Brand: NORTHSiDE. Positioning: AI that partners with humans — not replaces them.
CTA: northsideintelligence.com/services
`.trim();

/** Daily-rotating SERP queries for prospect discovery */
export const SEARCH_QUERIES = [
  'small logistics company operations manual processes founder',
  'healthcare admin clinic workflow automation COO',
  'professional services firm operations director small business',
  'manufacturing SMB digitization operations manager',
  'property management company workflow automation founder',
  'dental practice group operations director',
  'freight broker back office manual processes',
  'accounting firm operations automation partner',
];

export function todayUtc() {
  return new Date().toISOString().split('T')[0];
}

export function shortId(uuid) {
  return String(uuid).replace(/-/g, '').slice(0, 8);
}

export function parseNotes(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return typeof parsed === 'object' && parsed ? parsed : { raw: notes };
  } catch {
    return { raw: notes };
  }
}

export function formatNotes(meta) {
  return JSON.stringify(meta);
}
