#!/usr/bin/env node
/**
 * AXON Social Media Research — REBUILT 2026-08-26, JB direct correction.
 *
 * Original scaffold (PR #126) waited on JB's own first-party social platform
 * credentials and self-reported NEEDS_CREDENTIALS for everything. JB's
 * correction: it must NOT wait on those. Real EXTERNAL/PUBLIC research runs
 * now — competitor content and what's trending in each venture's niche —
 * using SerpApi (Google search, real key already in this repo's secrets),
 * synthesized into one usable plain-English finding per venture via Gemini
 * (fallback Anthropic Haiku). First-party analytics (JB's own account
 * engagement/follower data) stays a clearly marked extension point —
 * getFirstPartyAnalytics() in lib/axon-content-scaffold-shared.mjs — that
 * gets ADDED later once JB wires in NVG's own social accounts, never a
 * prerequisite for this job to do real work today.
 *
 * NEVER simulate fake engagement numbers, fake follower counts, or fake
 * trending posts. Real SerpApi results in, a real synthesis out, or an
 * honest "no results" — nothing invented.
 *
 * Ventures come from content_machine_brand_profiles (verified live table;
 * no venture_offering_dpmo table/view exists in this project).
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
  getFirstPartyAnalytics,
} from '../lib/axon-content-scaffold-shared.mjs';
import { externalSearch, synthesizeFinding } from '../lib/axon-research-synthesis.mjs';
import { AGENT } from '../lib/agent-names.mjs';

const JOB_ID = 'axon-social-media-research';
const PLATFORMS = ['Instagram', 'TikTok', 'X (Twitter)', 'LinkedIn'];

/** Build the niche/keyword string this venture's search should target, from real brand data — never hardcoded per-venture copy. */
function nicheKeyword(brand) {
  const vp = brand?.skeleton?.value_props?.[0]?.text;
  return vp ? `${brand.name} (${vp})` : brand.name;
}

/**
 * Product truths a venture's public copy must respect. Prefer the live brand-profile field
 * (skeleton.product_truths) so this is never hardcoded; fall back to Match Fit's known truths
 * (worldwide, lead with trending terms not our internal "Fitness Pro" label — JB 2026-09-03).
 */
export function brandProductTruths(brand) {
  const fromDb = brand?.skeleton?.product_truths;
  if (typeof fromDb === 'string' && fromDb.trim()) return fromDb.trim();
  if (brand?.slug === 'match-fit') {
    return 'Match Fit is WORLDWIDE — never say "nationwide" or name a place. In public/social copy lead with trending, widely-understood words ("coach", "trainer", "personal trainer"); "Fitness Pro" is our internal brand term, so use it sparingly and never lead with it while the brand is still being established.';
  }
  return '';
}

/** One real external research pass for one venture: SerpApi -> synthesis. */
async function researchVenture(cfg, brand) {
  const keyword = nicheKeyword(brand);
  const query = `"${brand.name}" OR (${keyword}) social media trends competitors 2026`;

  let results = [];
  let searchError = null;
  if (cfg.serpApiKey) {
    try {
      results = await externalSearch(cfg.serpApiKey, query, 6);
    } catch (err) {
      searchError = err.message;
      console.warn(`SerpApi search failed for ${brand.slug}: ${err.message}`);
    }
  }

  const firstParty = await getFirstPartyAnalytics(brand, PLATFORMS);

  if (!cfg.serpApiKey) {
    return {
      venture: brand.venture,
      brand: brand.name,
      slug: brand.slug,
      status: 'NEEDS_CREDENTIALS: SERPAPI_API_KEY not configured',
      finding: null,
      firstParty,
    };
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

  const system = `You are AXON's social media research analyst for Northside Ventures Group (NVG).
You turn raw Google search results into ONE clear, useful finding about a venture's niche —
what kind of content and topics are getting traction right now, and what NVG's competitors
are doing on social. Plain English, no jargon, no marketing fluff, under 130 words.
End with one concrete, specific content idea NVG could act on this week.
Only use what's actually in the search results below — never invent a stat, a post, or a
competitor that isn't there.`;

  const truths = brandProductTruths(brand);
  const prompt = `Venture: ${brand.name} (${brand.venture})
What this venture does: ${brand?.skeleton?.value_props?.[0]?.text || 'not specified'}
${truths ? `Product truths (any copy you suggest MUST respect these): ${truths}\n` : ''}
Raw Google search results for "${query}":
${JSON.stringify(results.map((r) => ({ title: r.title, snippet: r.snippet, link: r.link, source: r.source })), null, 2)}`;

  const synthesis = await synthesizeFinding(cfg, { system, prompt, rawResults: results });

  return {
    venture: brand.venture,
    brand: brand.name,
    slug: brand.slug,
    status: 'OK',
    finding: synthesis.text,
    findingSource: synthesis.source,
    resultCount: results.length,
    firstParty,
  };
}

async function main() {
  console.log(`AXON Social Media Research — ${new Date().toISOString()}`);
  const budget = startTimeBudget(8);

  const bootstrapKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = buildClient(bootstrapKey);

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;

  const cfg = await loadScaffoldConfig(sb.sbSelect);
  const ventures = await loadVentureList(sb.sbSelect);

  if (!ventures.length) {
    console.log('No ventures found in content_machine_brand_profiles — nothing to research.');
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
      results.push(await researchVenture(cfg, brand));
    } catch (err) {
      console.warn(`Research failed for ${brand.slug}: ${err.message}`);
      results.push({ venture: brand.venture, brand: brand.name, slug: brand.slug, status: `ERROR: ${err.message}`, finding: null });
    }
  }

  const ok = results.filter((r) => r.status === 'OK');

  // Loop-engineer: write each real finding to Decisions so it's searchable
  // by brand name — the exact lookup axon-content-batch-creation.mjs already
  // does (decision ILIKE brand name) — so tomorrow's draft batch can build on
  // today's real research instead of starting cold.
  for (const r of ok) {
    try {
      await writeDecision(sb, {
        decision: `[AXON Social Media Research, ${new Date().toISOString().slice(0, 10)}] ${r.brand}: ${r.finding} (source: ${r.findingSource}, ${r.resultCount} search result(s) reviewed. First-party account analytics: not wired in yet — external/public research only this pass.)`,
        status: 'active',
        durability: 'durable',
      });
    } catch (err) {
      console.warn(`Decisions write failed for ${r.slug}: ${err.message}`);
    }
  }

  const busBody = plainEnglish([
    `Social Media Research run — ${new Date().toISOString().slice(0, 10)}.`,
    `Checked ${results.length} of ${ventures.length} venture(s). Real external research via SerpApi + Gemini/Anthropic synthesis — ${ok.length} finding(s), ${results.length - ok.length} blocked/empty.`,
    `First-party account analytics (JB's own social accounts) still NEEDS_CREDENTIALS — that stays a separate add-on, not a blocker for this run.`,
    '',
    ...results.map((r) => (r.status === 'OK' ? `${r.brand} (${r.venture}): ${r.finding}` : `${r.brand} (${r.venture}): ${r.status}`)),
  ]);

  try {
    await writeAgentBus(sb, {
      from_agent: AGENT.SOCIAL_MEDIA_RESEARCH,
      to_agent: AGENT.EXECUTIVE_AGENT,
      subject: `Social Media Research — ${ok.length}/${results.length} real finding(s)`,
      body: busBody,
      needs_answer: false,
    });
    await writeAgentBus(sb, {
      from_agent: AGENT.SOCIAL_MEDIA_RESEARCH,
      to_agent: 'CONTENT',
      subject: `Fresh niche/competitor research for content drafts — ${ok.length} venture(s)`,
      body: busBody,
      needs_answer: false,
    });
    console.log('Wrote run summary to agent_bus (AXON Executive + CONTENT).');
  } catch (err) {
    console.warn(`agent_bus write failed: ${err.message}`);
  }

  if (ok.length === 0 && results.length > 0) {
    await notifyJbUrgent(cfg, `⚠️ Social Media Research ran but got zero real findings (${results.length} venture(s) checked) — worth a look when you have a sec.`, { agentName: 'AXON Content Research' });
  }

  const humanSummary = plainEnglish([
    `AXON did real social media research for ${ok.length} of your ${ventures.length} ventures today. 🔎`,
    `It searched Google for what's trending and what competitors are doing in each niche, then summed it up in plain English — not raw data dumps.`,
    `Your own accounts aren't hooked up yet, so that part's still off — but this doesn't need them to be useful. Nothing here was made up.`,
  ]);
  console.log(humanSummary);
}

main().catch(async (err) => {
  console.error('AXON Social Media Research failed:', err.message);
  process.exit(1);
});
