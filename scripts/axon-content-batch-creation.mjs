#!/usr/bin/env node
/**
 * AXON Content-Batch-Creation — rebuilt from AXON Content Batch Notify
 * (scripts/axon-content-batch-notify.mjs, which only NOTIFIES on pending
 * batches). This job actually WRITES the draft batch.
 *
 * JB direct order 2026-08-26. SCAFFOLD PASS — zero live external API calls.
 * Source material for drafts is 100% internal: recent Decisions/Learnings
 * (NI-Brain) plus this brand's own recent content_machine_posts history.
 * No social/SEO API, no LLM call in this pass — captions are assembled with
 * plain templates over real internal rows, never invented from nothing and
 * never faked as if a model or a live source produced them.
 *
 * Writes to content_machine_posts — the real, live table (verified 2026-08-26
 * against lib/axon-content-machine.ts, lib/content-machine-telegram.mjs, and
 * today's hermes-content-daily-batch run). match_fit_content_calendar_posts
 * is a separate, older MF-dashboard table with zero references in scripts/
 * or lib/ — not what CONTENT reads, so it is not touched here.
 *
 * Match Fit stays excluded by default (same MF-Telegram-pause rule as the
 * notify job, Decisions #89/#90) unless AXON_CM6_ALLOW_MATCH_FIT=1.
 */
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import {
  loadScaffoldConfig,
  buildClient,
  startTimeBudget,
  scheduleResumeIn12h,
  notifyJbUrgent,
  plainEnglish,
  loadVentureList,
} from '../lib/axon-content-scaffold-shared.mjs';

const JOB_ID = 'axon-content-batch-creation';
const POSTS_PER_BRAND = 3;

function allowMatchFit() {
  return (
    process.env.CONTENT_MACHINE_ALLOW_MATCH_FIT === '1'
    || process.env.AXON_CM6_ALLOW_MATCH_FIT === '1'
  );
}

/** Brands whose positioning is worldwide, so "nationwide"/place-based phrasing is an error to fix. */
const WORLDWIDE_BRAND_SLUGS = new Set(['match-fit']);

/**
 * Soft-rewrite "nationwide"/place-based phrasing that a source row may carry — but ONLY for brands
 * that are actually worldwide (Match Fit; JB standing rule 6 / 2026-09-03). A genuinely US-only
 * venture may legitimately say "nationwide", so this is gated by brand and never applied globally.
 */
function worldwideSafe(text) {
  return String(text || '')
    .replace(/\bnation[-\s]?wide\b/gi, (m) => (m === m.toUpperCase() ? 'WORLDWIDE' : 'worldwide'))
    .replace(/\bacross the (?:country|nation)\b/gi, 'around the world');
}

/** Build one draft caption from real internal rows only — no invention, no API call. */
function templateCaption({ brandName, brandSlug, sourceText, sourceKind }) {
  const raw = String(sourceText || '').replace(/\s+/g, ' ').trim();
  const clean = (WORLDWIDE_BRAND_SLUGS.has(brandSlug) ? worldwideSafe(raw) : raw).slice(0, 220);
  if (!clean) {
    return `${brandName} update — draft pending a real content angle (no recent ${sourceKind} found to template from). Needs a human pass before this goes anywhere.`;
  }
  return `${brandName}: ${clean}\n\n(Draft — templated from internal ${sourceKind}, not yet reviewed. Needs a real content angle + human edit before scheduling.)`;
}

async function draftsForBrand(sb, sbSelect, brand) {
  const drafts = [];

  let decisions = [];
  try {
    decisions = await sbSelect(
      'Decisions',
      `decision=ilike.*${encodeURIComponent(brand.name)}*&order=created_at.desc&limit=3&select=id,decision,created_at`,
    );
  } catch (err) {
    console.warn(`Decisions lookup failed for ${brand.slug}: ${err.message}`);
  }

  let history = [];
  try {
    history = await sbSelect(
      'content_machine_posts',
      `brand_slug=eq.${encodeURIComponent(brand.slug)}&order=created_at.desc&limit=5&select=id,caption,theme_name,post_type`,
    );
  } catch (err) {
    console.warn(`History lookup failed for ${brand.slug}: ${err.message}`);
  }

  const sources = [
    ...decisions.map((d) => ({ text: d.decision, kind: 'Decision' })),
    ...history.map((h) => ({ text: h.caption, kind: 'content history' })),
  ].slice(0, POSTS_PER_BRAND);

  const dayCount = Math.max(sources.length, 1);
  for (let i = 0; i < dayCount && drafts.length < POSTS_PER_BRAND; i += 1) {
    const src = sources[i] || { text: '', kind: 'internal data' };
    drafts.push({
      brand,
      caption: templateCaption({ brandName: brand.name, brandSlug: brand.slug, sourceText: src.text, sourceKind: src.kind }),
      themeName: src.kind === 'Decision' ? 'from-a-recent-decision' : 'from-content-history',
    });
  }
  return drafts;
}

async function main() {
  console.log(`AXON Content-Batch-Creation — ${new Date().toISOString()}`);
  const budget = startTimeBudget(8);

  const bootstrapKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = buildClient(bootstrapKey);

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;

  const realCfg = await loadScaffoldConfig(sb.sbSelect);

  const ventures = await loadVentureList(sb.sbSelect);
  if (!ventures.length) {
    console.log('No brands found in content_machine_brand_profiles — nothing to draft.');
    return;
  }

  const batchId = `cbc-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
  let written = 0;
  let skippedMf = 0;

  for (const brand of ventures) {
    if (budget.expired()) {
      console.log(`Time budget hit after ${budget.elapsedSec()}s — stopping cleanly, will resume.`);
      await scheduleResumeIn12h(sb, JOB_ID);
      break;
    }
    if (brand.slug === 'match-fit' && !allowMatchFit()) {
      skippedMf += 1;
      continue;
    }

    const drafts = await draftsForBrand(sb, sb.sbSelect, brand);
    for (const draft of drafts) {
      try {
        await sb.sbInsert('content_machine_posts', {
          brand_slug: draft.brand.slug,
          status: 'pending_approval',
          post_type: 'draft_internal_scaffold',
          target_group: draft.brand.venture || 'general',
          theme_name: draft.themeName,
          caption: draft.caption,
          hashtags: [],
          platforms: [],
          batch_id: batchId,
          meta: {
            source: JOB_ID,
            internal_only: true,
            scaffold_pass: true,
            note: 'Templated from internal Decisions/content history only — zero external API calls this pass.',
          },
        });
        written += 1;
      } catch (err) {
        console.warn(`Insert failed for ${draft.brand.slug}: ${err.message}`);
      }
    }
  }

  const summary = plainEnglish([
    `AXON drafted ${written} content post(s) for you to look over.`,
    skippedMf ? `Match Fit was skipped on purpose (that stays off until you say otherwise).` : '',
    `These are rough drafts built from your own past decisions and old posts — nothing made up, nothing pulled from outside sources.`,
    `They're sitting in the content queue waiting for a real review before anything goes out.`,
  ]);
  console.log(summary);

  if (written === 0) {
    await notifyJbUrgent(realCfg, `⚠️ Content-Batch-Creation ran but couldn't draft anything — worth a quick look when you have a sec.`);
  }
}

main().catch(async (err) => {
  console.error('AXON Content-Batch-Creation failed:', err.message);
  process.exit(1);
});
