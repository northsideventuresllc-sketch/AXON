#!/usr/bin/env node
/**
 * AXON SEO Tracker — REBUILT 2026-08-26, JB direct correction.
 *
 * Original scaffold (PR #126) waited on real first-party SEO data sources
 * (Search Console, rank tracker, backlink tool) and self-reported
 * NEEDS_CREDENTIALS for everything. JB's correction: it must NOT wait on
 * those. Real PUBLIC SEO signal runs now — who's actually ranking for each
 * venture's core keyword right now, and whether NVG's own live page shows up
 * — via SerpApi (Google search, real key already in this repo's secrets),
 * synthesized into one usable plain-English finding per venture via Gemini
 * (fallback Anthropic Haiku). First-party SEO data (Search Console
 * impressions/clicks once JB wires it in) stays a clearly marked extension
 * point — getFirstPartyAnalytics() in lib/axon-content-scaffold-shared.mjs —
 * added later as an enhancement, never a prerequisite.
 *
 * NEVER simulate a rank position, traffic number, or keyword position that
 * wasn't actually observed in a real search result. Real SerpApi results in,
 * a real synthesis out, or an honest "no results" — nothing invented.
 *
 * Ventures/domains come from content_machine_brand_profiles.cta_paths (real,
 * live URLs) — no venture_offering_dpmo table/view exists in this project.
 */
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import {
  loadScaffoldConfig,
  buildClient,
  startTimeBudget,
  scheduleResumeIn12h,
  notifyJbUrgent,
  writeAgentBus,
  writeDecision,
  plainEnglish,
  loadVentureList,
  deriveDomain,
  getFirstPartyAnalytics,
} from '../lib/axon-content-scaffold-shared.mjs';
import { externalSearch, synthesizeFinding } from '../lib/axon-research-synthesis.mjs';
import { AGENT } from '../lib/agent-names.mjs';

const JOB_ID = 'axon-seo-tracker';
const SEO_SOURCES = ['Google Search Console', 'Keyword rank tracker', 'Backlink data'];

/** Core keyword this venture should realistically rank for, from real brand data. */
function coreKeyword(brand) {
  const vp = brand?.skeleton?.value_props?.[0]?.text;
  return vp ? `${brand.name} ${vp}`.slice(0, 90) : brand.name;
}

async function trackVenture(cfg, brand) {
  const domain = deriveDomain(brand);
  const firstParty = await getFirstPartyAnalytics(brand, SEO_SOURCES);

  if (!cfg.serpApiKey) {
    return { venture: brand.venture, brand: brand.name, slug: brand.slug, status: 'NEEDS_CREDENTIALS: SERPAPI_API_KEY not configured', finding: null, firstParty };
  }
  if (!domain) {
    return { venture: brand.venture, brand: brand.name, slug: brand.slug, status: 'NO_LIVE_URL: no https:// URL found in cta_paths for this venture', finding: null, firstParty };
  }

  const keyword = coreKeyword(brand);
  const query = `${keyword}`;

  let results = [];
  let searchError = null;
  try {
    results = await externalSearch(cfg.serpApiKey, query, 8);
  } catch (err) {
    searchError = err.message;
    console.warn(`SerpApi search failed for ${brand.slug}: ${err.message}`);
  }

  if (!results.length) {
    return {
      venture: brand.venture,
      brand: brand.name,
      slug: brand.slug,
      status: searchError ? `SEARCH_FAILED: ${searchError}` : 'NO_RESULTS: SerpApi returned nothing for this query',
      finding: null,
      firstParty,
    };
  }

  const ownDomainRank = results.findIndex((r) => {
    try {
      return new URL(r.link).hostname.replace(/^www\./, '') === domain.hostname.replace(/^www\./, '');
    } catch {
      return false;
    }
  });

  const system = `You are AXON's SEO analyst for Northside Ventures Group (NVG).
You turn raw Google search results into ONE clear SEO finding for a venture: who is actually
ranking for its core keyword right now, whether NVG's own page (${domain.hostname}${domain.path}) shows
up at all and roughly where, and what that means. Plain English, no jargon, under 130 words.
End with one concrete, specific SEO action NVG could take this week.
Only use what's actually in the search results below — never invent a rank position, a
competitor, or a traffic number that isn't there.`;

  const prompt = `Venture: ${brand.name} (${brand.venture})
NVG's live page: ${domain.url}
Search query used: "${query}"
NVG's page found in these results at position (0-indexed, -1 = not in top ${results.length}): ${ownDomainRank}

Raw Google search results:
${JSON.stringify(results.map((r, i) => ({ position: i, title: r.title, snippet: r.snippet, link: r.link, source: r.source })), null, 2)}`;

  const synthesis = await synthesizeFinding(cfg, { system, prompt, rawResults: results });

  return {
    venture: brand.venture,
    brand: brand.name,
    slug: brand.slug,
    status: 'OK',
    finding: synthesis.text,
    findingSource: synthesis.source,
    domain: domain.hostname + domain.path,
    ownDomainRank,
    resultCount: results.length,
    firstParty,
  };
}

async function main() {
  console.log(`AXON SEO Tracker — ${new Date().toISOString()}`);
  const budget = startTimeBudget(8);

  const bootstrapKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = buildClient(bootstrapKey);

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;

  const cfg = await loadScaffoldConfig(sb.sbSelect);
  const ventures = await loadVentureList(sb.sbSelect);

  if (!ventures.length) {
    console.log('No ventures found in content_machine_brand_profiles — nothing to track.');
    return;
  }

  const results = [];
  for (const brand of ventures) {
    if (budget.expired()) {
      console.log(`Time budget hit after ${budget.elapsedSec()}s — stopping cleanly, will resume within ~12h.`);
      await scheduleResumeIn12h(sb, JOB_ID);
      break;
    }
    try {
      results.push(await trackVenture(cfg, brand));
    } catch (err) {
      console.warn(`SEO tracking failed for ${brand.slug}: ${err.message}`);
      results.push({ venture: brand.venture, brand: brand.name, slug: brand.slug, status: `ERROR: ${err.message}`, finding: null });
    }
  }

  const ok = results.filter((r) => r.status === 'OK');

  for (const r of ok) {
    try {
      await writeDecision(sb, {
        decision: `[AXON SEO Tracker, ${new Date().toISOString().slice(0, 10)}] ${r.brand} (${r.domain}): ${r.finding} (source: ${r.findingSource}, own-page position: ${r.ownDomainRank >= 0 ? r.ownDomainRank : 'not in top results'}. First-party SEO data — Search Console etc. — not wired in yet — public search signal only this pass.)`,
        status: 'active',
        durability: 'durable',
      });
    } catch (err) {
      console.warn(`Decisions write failed for ${r.slug}: ${err.message}`);
    }
  }

  const busBody = plainEnglish([
    `SEO Tracker run — ${new Date().toISOString().slice(0, 10)}.`,
    `Checked ${results.length} of ${ventures.length} venture(s). Real public SEO signal via SerpApi + Gemini/Anthropic synthesis — ${ok.length} finding(s), ${results.length - ok.length} blocked/empty.`,
    `First-party SEO data (Search Console, backlink tools) still NEEDS_CREDENTIALS — that stays a separate add-on, not a blocker for this run.`,
    '',
    ...results.map((r) => (r.status === 'OK' ? `${r.brand} (${r.venture}) — ${r.domain}: ${r.finding}` : `${r.brand} (${r.venture}): ${r.status}`)),
  ]);

  try {
    await writeAgentBus(sb, {
      from_agent: AGENT.SEO_TRACKER,
      to_agent: AGENT.EXECUTIVE_AGENT,
      subject: `SEO Tracker — ${ok.length}/${results.length} real finding(s)`,
      body: busBody,
      needs_answer: false,
    });
    await writeAgentBus(sb, {
      from_agent: AGENT.SEO_TRACKER,
      to_agent: 'CONTENT',
      subject: `Fresh SEO/ranking signal for content drafts — ${ok.length} venture(s)`,
      body: busBody,
      needs_answer: false,
    });
    console.log('Wrote run summary to agent_bus (AXON Executive + CONTENT).');
  } catch (err) {
    console.warn(`agent_bus write failed: ${err.message}`);
  }

  if (ok.length === 0 && results.length > 0) {
    await notifyJbUrgent(cfg, `⚠️ SEO Tracker ran but got zero real findings (${results.length} venture(s) checked) — worth a look when you have a sec.`, { agentName: 'AXON-SEO-Tracker' });
  }

  const humanSummary = plainEnglish([
    `AXON did a real SEO check for ${ok.length} of your ${ventures.length} ventures today. 📈`,
    `It searched Google for each one's core keyword and looked at who's actually ranking, including whether your own page shows up — then summed it up in plain English.`,
    `Search Console and backlink tools aren't hooked up yet, so that part's still off — but this doesn't need them to be useful. Nothing here was made up.`,
  ]);
  console.log(humanSummary);
}

main().catch(async (err) => {
  console.error('AXON SEO Tracker failed:', err.message);
  process.exit(1);
});
