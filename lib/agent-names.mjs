/**
 * Canonical AXON agent names — single source of truth for `agent_bus`
 * from_agent/to_agent literals and any other place an agent name string
 * is needed.
 *
 * Canonical names live in NI-Brain table `nvg_agent_routines.agent_name`.
 * These constants exist because several AXON GitHub-Actions scripts had
 * drifted to their own ad-hoc names — fix the drift here once instead of
 * at every call site.
 */
export const AGENT = Object.freeze({
  SEO_TRACKER: 'AXON-SEO-Tracker',
  SOCIAL_MEDIA_RESEARCH: 'AXON Content Research',
  TRAINING_INGEST: 'AXON Training Librarian',
  SELF_RESEARCH: 'AXON Research',
  COMPETITOR_SCAN: 'AXON-Competitor-Scan',
  UI_COPY: 'AXON UI Copy',

  EXECUTIVE_AGENT: 'AXON Executive',
  SENSEI: 'SENSEI',
  // Kept apart from the AXON job names above so PR 301 (UI_COPY, added after COMPETITOR_SCAN) merges without a conflict.
  LEGAL_DOCS: 'AXON Legal Docs',
});
