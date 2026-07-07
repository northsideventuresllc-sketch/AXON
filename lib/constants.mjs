export const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
export const SOURCE = 'axon_ni_services';
export const MAX_DRAFTS_PER_DAY = 15;
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

export {
  ICP,
  MIN_OUTREACH_SCORE,
  SEARCH_QUERIES,
  pickQueriesForDay,
  serpQueryWithNegatives,
  SCORE_RUBRIC,
} from './icp-config.mjs';

import { MIN_OUTREACH_SCORE } from './icp-config.mjs';

/** @deprecated use MIN_OUTREACH_SCORE */
export const MIN_SCORE = MIN_OUTREACH_SCORE;

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
