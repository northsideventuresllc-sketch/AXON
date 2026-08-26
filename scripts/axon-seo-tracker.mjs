#!/usr/bin/env node
/**
 * AXON SEO Tracker — NEW job, SCAFFOLDING ONLY.
 * JB direct order 2026-08-26.
 *
 * Same pattern as AXON Social Media Research: real job structure, real
 * per-venture dispatch, wired to agent_bus — but zero live external API
 * calls. Real rank tracking / keyword data / backlink data needs a live SEO
 * data source (Search Console, SEMrush/Ahrefs, SerpApi rank endpoint, etc.)
 * that is NOT wired in yet. At the exact point that call would go, this
 * self-reports NEEDS_CREDENTIALS and stops that venture cleanly — never a
 * simulated rank, traffic number, or keyword position.
 *
 * Ventures come from content_machine_brand_profiles (verified 2026-08-26,
 * live table) — venture_offering_dpmo does not exist in this project.
 */
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import {
  loadScaffoldConfig,
  buildClient,
  startTimeBudget,
  scheduleResumeIn12h,
  writeAgentBus,
  needsCredentials,
  plainEnglish,
  loadVentureList,
} from '../lib/axon-content-scaffold-shared.mjs';

const JOB_ID = 'axon-seo-tracker';

/** SEO data sources this job would eventually pull per venture, once credentialed. */
const SEO_SOURCES = ['Google Search Console', 'Keyword rank tracker', 'Backlink data'];

async function trackVenture(brand) {
  const findings = SEO_SOURCES.map((source) => ({ source, status: needsCredentials(source) }));
  return {
    venture: brand.venture,
    brand: brand.name,
    slug: brand.slug,
    findings,
  };
}

async function main() {
  console.log(`AXON SEO Tracker — ${new Date().toISOString()}`);
  const budget = startTimeBudget(8);

  const bootstrapKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = buildClient(bootstrapKey);

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;

  await loadScaffoldConfig(sb.sbSelect); // validated reachable; token itself unused past this point
  const ventures = await loadVentureList(sb.sbSelect);

  if (!ventures.length) {
    console.log('No ventures found in content_machine_brand_profiles — nothing to track.');
    return;
  }

  const results = [];
  for (const brand of ventures) {
    if (budget.expired()) {
      console.log(`Time budget hit after ${budget.elapsedSec()}s — stopping cleanly, will resume.`);
      await scheduleResumeIn12h(sb, JOB_ID);
      break;
    }
    try {
      results.push(await trackVenture(brand));
    } catch (err) {
      console.warn(`SEO tracking dispatch failed for ${brand.slug}: ${err.message}`);
    }
  }

  const busBody = plainEnglish([
    `SEO Tracker scaffold run — ${new Date().toISOString().slice(0, 10)}.`,
    `Checked ${results.length} of ${ventures.length} venture(s).`,
    `Every venture needs a real SEO data source connected before this can pull real numbers — none exist yet, so nothing was faked.`,
    '',
    ...results.map(
      (r) => `${r.brand} (${r.venture}): ${r.findings.map((f) => f.status).join(' | ')}`,
    ),
  ]);

  try {
    await writeAgentBus(sb, {
      from_agent: 'AXON SEO Tracker',
      to_agent: 'AXON Executive Agent',
      subject: `SEO Tracker scaffold run — ${results.length} venture(s), all NEEDS_CREDENTIALS`,
      body: busBody,
      needs_answer: false,
    });
    console.log('Wrote run summary to agent_bus (to_agent=AXON Executive Agent).');
  } catch (err) {
    console.warn(`agent_bus write failed: ${err.message}`);
  }

  const humanSummary = plainEnglish([
    `AXON checked ${results.length} of your ventures for SEO tracking.`,
    `Every one is blocked on the same thing: no SEO data source is hooked up yet (Search Console, rank tracker, backlinks).`,
    `Nothing fake was made up — it just says clearly what's missing for each one.`,
    `The structure's ready to go the moment a real SEO connection exists.`,
  ]);
  console.log(humanSummary);
}

main().catch(async (err) => {
  console.error('AXON SEO Tracker failed:', err.message);
  process.exit(1);
});
