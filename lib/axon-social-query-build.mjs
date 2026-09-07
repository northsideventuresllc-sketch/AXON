/**
 * Per-venture SerpApi query construction for AXON Content Research's
 * social-trends lane (scripts/axon-social-media-research.mjs).
 * RESEARCH-6of6-QUERY-BUILD-0907.
 *
 * Pulled out into lib/ (rather than living in the script) so it is safely
 * importable — scripts/*.mjs in this repo call main() unconditionally at the
 * bottom with no import.meta guard, so importing a script file runs the
 * whole job as a side effect.
 */
import { deriveDomain } from './axon-content-scaffold-shared.mjs';

/** Build the niche/keyword string this venture's search should target, from real brand data — never hardcoded per-venture copy. */
export function nicheKeyword(brand) {
  const vp = brand?.skeleton?.value_props?.[0]?.text;
  return vp ? `${brand.name} (${vp})` : brand.name;
}

/**
 * This venture's SerpApi query variants, in the order to try them.
 *
 * 1. Generic niche query (brand name + value-prop keyword) — works well for
 *    established brands with real search volume.
 * 2. Site-anchored fallback (brand name + its own live domain, via
 *    deriveDomain from cta_paths) — for a small/pre-launch product whose
 *    bare name is too short/ambiguous to return anything useful on its own
 *    (e.g. BridgeAI, GapScan — brand-new NI Marketing toolkit entries),
 *    anchoring to the venture's real URL still returns real, relevant
 *    results instead of an empty/noisy set.
 *
 * Built entirely from the live brand row — nothing hardcoded per venture.
 */
export function buildSocialQueries(brand) {
  const keyword = nicheKeyword(brand);
  const domain = deriveDomain(brand);
  const queries = [
    `"${brand.name}"${keyword && keyword !== brand.name ? ` OR (${keyword})` : ''} social media trends competitors 2026`,
  ];
  if (domain?.hostname) {
    queries.push(`"${brand.name}" (site:${domain.hostname} OR "${domain.hostname}") 2026`);
  }
  return queries;
}
