#!/usr/bin/env node
/**
 * AXON Phase 1 — NI Services outreach engine
 * find → score → draft → queue → Telegram notify
 */
import { randomUUID } from 'node:crypto';
import { haikuScoreAndDraft, scanProspect } from '../lib/ai.mjs';
import { loadConfig } from '../lib/config.mjs';
import {
  MAX_DRAFTS_PER_DAY,
  SEARCH_QUERIES,
  SOURCE,
  formatNotes,
  parseNotes,
  shortId,
  todayUtc,
} from '../lib/constants.mjs';
import { searchProspects } from '../lib/serpapi.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { formatDraftMessage, telegramSend } from '../lib/telegram.mjs';

const today = todayUtc();

async function countTodayDrafts(sbSelect) {
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&added=eq.${today}&select=id`
  );
  return rows?.length || 0;
}

async function existingHandles(sbSelect) {
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&select=handle&limit=500`
  );
  return new Set((rows || []).map((r) => (r.handle || '').toLowerCase()));
}

function pickQueries() {
  const dayIndex = new Date().getUTCDay();
  const primary = SEARCH_QUERIES[dayIndex % SEARCH_QUERIES.length];
  const secondary = SEARCH_QUERIES[(dayIndex + 3) % SEARCH_QUERIES.length];
  return [primary, secondary];
}

async function main() {
  console.log(`AXON NI outreach — ${new Date().toISOString()}`);
  const { sbSelect, sbInsert } = createSupabaseClient(
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const cfg = await loadConfig(sbSelect);

  const madeToday = await countTodayDrafts(sbSelect);
  const remaining = MAX_DRAFTS_PER_DAY - madeToday;
  console.log(`Drafts today: ${madeToday}/${MAX_DRAFTS_PER_DAY} (remaining: ${remaining})`);

  if (remaining <= 0) {
    console.log('Daily cap reached — exiting');
    return;
  }

  const known = await existingHandles(sbSelect);
  const queries = pickQueries();
  let prospects = [];

  for (const q of queries) {
    console.log(`SERPAPI: ${q}`);
    try {
      const batch = await searchProspects(cfg.serpApiKey, q, 8);
      prospects.push(...batch);
    } catch (err) {
      console.warn(`SERPAPI failed for "${q}": ${err.message}`);
    }
  }

  // Dedupe by title+link
  const seen = new Set();
  prospects = prospects.filter((p) => {
    const key = `${p.title}|${p.link}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Prospects from search: ${prospects.length}`);

  let created = 0;
  for (const prospect of prospects) {
    if (created >= remaining) break;

    const scan = await scanProspect(cfg, prospect);
    if (scan._scan_source) {
      console.log(`Scan via ${scan._scan_source}: ${prospect.title?.slice(0, 60) || 'prospect'}`);
    }

    const company = (scan.company || prospect.title || '').trim();
    if (!company || known.has(company.toLowerCase())) continue;

    let draft;
    try {
      draft = await haikuScoreAndDraft(cfg, scan, prospect);
    } catch (err) {
      console.warn(`Haiku draft skip: ${err.message}`);
      continue;
    }

    if ((draft.score ?? 0) < 55) {
      console.log(`Skip low score (${draft.score}): ${company}`);
      continue;
    }

    const channel = draft.channel === 'linkedin' ? 'linkedin' : 'email';
    const draftBody =
      channel === 'email' ? (draft.email_body || '').trim() : (draft.linkedin_dm || '').trim();
    if (!draftBody) {
      console.warn(`Skip empty draft body: ${company}`);
      continue;
    }

    const meta = {
      channel,
      score: draft.score,
      recommended_service: draft.recommended_service,
      email_subject: draft.email_subject || null,
      contact_email: draft.contact_email || null,
      source_link: prospect.link,
      serp_title: prospect.title,
      scan_source: scan._scan_source || 'unknown',
    };

    const row = {
      id: randomUUID(),
      handle: company,
      niche: scan.industry || scan.niche || 'general',
      target_group: draft.target_group || scan.segment || 'smb',
      why_match_fit: draft.why_match_fit || scan.fit_summary || '',
      comment_draft: channel === 'email' ? draftBody : '',
      dm_draft: channel === 'linkedin' ? draftBody : '',
      status: 'pending_approval',
      notes: formatNotes(meta),
      added: today,
      source: SOURCE,
      dm_sent: false,
      followed: false,
      commented: false,
    };

    if (cfg.dryRun) {
      console.log(`[DRY RUN] would insert lead: ${company} (${draft.score})`);
      created++;
      known.add(company.toLowerCase());
      continue;
    }

    const inserted = await sbInsert('ni_brain_outreach', row);
    known.add(company.toLowerCase());
    created++;

    const sid = shortId(inserted.id || row.id);
    console.log(`Queued: ${company} · ${sid} · score ${draft.score}`);

    if (cfg.telegramToken && cfg.telegramChatId) {
      try {
        const notifyLead = { ...inserted, _meta: meta };
        if (!notifyLead._meta.score) notifyLead._meta = { ...parseNotes(inserted.notes), ...meta };
        await telegramSend(
          cfg.telegramToken,
          cfg.telegramChatId,
          formatDraftMessage(notifyLead, sid),
          false
        );
      } catch (err) {
        console.warn(`Telegram notify failed for ${sid}: ${err.message}`);
      }
    } else {
      console.warn('Telegram not configured — draft saved to NI-Brain only');
    }
  }

  console.log(`Done. Created ${created} draft(s).`);
  if (!cfg.telegramToken || !cfg.telegramChatId) {
    console.log('Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to GitHub secrets to enable approval queue.');
  }
}

main().catch((err) => {
  console.error('❌ AXON outreach failed:', err.message);
  process.exit(1);
});
