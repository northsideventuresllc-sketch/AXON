#!/usr/bin/env node
/**
 * AXON Social Media Research — NEW job, SCAFFOLDING ONLY.
 * JB direct order 2026-08-26.
 *
 * Real per-venture social platform research (engagement, follower counts,
 * trending content, competitor posts) needs real platform API credentials
 * that are NOT wired in yet. This pass builds the real job structure and
 * per-venture dispatch loop, and — at the exact point a real platform call
 * would go — self-reports NEEDS_CREDENTIALS and stops that venture cleanly.
 *
 * NEVER simulate fake engagement numbers, fake follower counts, or fake
 * trending posts here. A NEEDS_CREDENTIALS line is always the honest output
 * until real API keys exist in ni_platform_secrets.
 *
 * Ventures come from content_machine_brand_profiles (verified 2026-08-26,
 * live table) — no venture_offering_dpmo table/view exists in this project,
 * so that name from the original ask does not resolve to anything real;
 * flagged here rather than silently guessing at it.
 */
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import {
  loadScaffoldConfig,
  buildClient,
  startTimeBudget,
  scheduleResumeIn12h,
  notifyJbUrgent,
  writeAgentBus,
  needsCredentials,
  plainEnglish,
  loadVentureList,
} from '../lib/axon-content-scaffold-shared.mjs';

const JOB_ID = 'axon-social-media-research';

/** Platforms this job would eventually research per venture, once credentialed. */
const PLATFORMS = ['Instagram', 'TikTok', 'X (Twitter)', 'LinkedIn'];

/**
 * Per-venture subagent dispatch. In this scaffold pass this is a plain
 * function call (no external agent runtime needed) — the dispatch SHAPE is
 * what's being built: one independent unit of work per venture, each one
 * able to fail/skip on its own without blocking the others.
 */
async function researchVenture(brand) {
  const findings = [];
  for (const platform of PLATFORMS) {
    // This is exactly where a real platform API call would go.
    findings.push({ platform, status: needsCredentials(platform) });
  }
  return {
    venture: brand.venture,
    brand: brand.name,
    slug: brand.slug,
    findings,
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
    console.log('No ventures found in content_machine_brand_profiles — nothing to dispatch.');
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
      results.push(await researchVenture(brand));
    } catch (err) {
      console.warn(`Research dispatch failed for ${brand.slug}: ${err.message}`);
    }
  }

  const busBody = plainEnglish([
    `Social Media Research scaffold run — ${new Date().toISOString().slice(0, 10)}.`,
    `Checked ${results.length} of ${ventures.length} venture(s).`,
    `Every venture needs real platform credentials before this can pull real data — none exist yet, so nothing was faked.`,
    '',
    ...results.map(
      (r) => `${r.brand} (${r.venture}): ${r.findings.map((f) => f.status).join(' | ')}`,
    ),
  ]);

  try {
    await writeAgentBus(sb, {
      from_agent: 'AXON Social Media Research',
      to_agent: 'AXON Executive Agent',
      subject: `Social Media Research scaffold run — ${results.length} venture(s), all NEEDS_CREDENTIALS`,
      body: busBody,
      needs_answer: false,
    });
    console.log('Wrote run summary to agent_bus (to_agent=AXON Executive Agent).');
  } catch (err) {
    console.warn(`agent_bus write failed: ${err.message}`);
  }

  const humanSummary = plainEnglish([
    `AXON checked ${results.length} of your ventures for social media research.`,
    `Every single one is blocked on the same thing: no social platform login/API keys are set up yet.`,
    `Nothing fake was made up — it just says clearly what's missing for each one.`,
    `The structure's ready to go the moment real credentials exist.`,
  ]);
  console.log(humanSummary);
}

main().catch(async (err) => {
  console.error('AXON Social Media Research failed:', err.message);
  process.exit(1);
});
