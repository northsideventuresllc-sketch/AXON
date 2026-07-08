#!/usr/bin/env node
/**
 * AXON Phase 1 — NI Services outreach engine
 * find → score → draft → queue → Telegram notify
 * ICP refactor: 8-step pipeline wired in lib/icp-config + lib/icp-filter
 */
import { randomUUID } from 'node:crypto';
import { haikuScoreAndDraft, scanProspect } from '../lib/ai.mjs';
import { loadConfig } from '../lib/config.mjs';
import {
  MAX_DRAFTS_PER_DAY,
  MIN_OUTREACH_SCORE,
  SOURCE,
  formatNotes,
  parseNotes,
  pickQueriesForDay,
  shortId,
  todayUtc,
} from '../lib/constants.mjs';
import {
  postScanRejectReason,
  preScanRejectReason,
  rejectPendingIcpViolations,
  scanIcpRejectReason,
} from '../lib/icp-filter.mjs';
import { loadOutreachTrainingPrompt, logOutreachIcpDropSignal } from '../lib/outreach-learn-core.mjs';
import { sweepOutreachLeadLifecycle } from '../lib/outreach-lifecycle-core.mjs';
import { searchProspects } from '../lib/serpapi.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { recordDraftNotification } from '../lib/telegram-handler.mjs';
import { formatDraftMessage, telegramSend } from '../lib/telegram.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    `source=eq.${SOURCE}&select=handle,status,notes&limit=1000`
  );
  const handles = new Set();
  for (const row of rows || []) {
    const handle = (row.handle || '').toLowerCase();
    if (!handle) continue;
    handles.add(handle);
    if (row.status === 'purged') {
      const meta = parseNotes(row.notes);
      if (meta.blocked_handle) handles.add(String(meta.blocked_handle).toLowerCase());
    }
  }
  return handles;
}

async function logIcpDrop(sbInsert, { reason, stage, label, dryRun }) {
  if (dryRun || !sbInsert) {
    console.log(`ICP drop (${stage}): ${label} — ${reason}`);
    return;
  }
  try {
    await logOutreachIcpDropSignal(sbInsert, { reason, stage, label });
  } catch {
    console.log(`ICP drop (${stage}): ${label} — ${reason}`);
  }
}

async function main() {
  console.log(`AXON NI outreach — ${new Date().toISOString()}`);
  const { sbSelect, sbInsert, sbPatch } = createSupabaseClient(
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const cfg = await loadConfig(sbSelect);

  try {
    const sweep = await sweepOutreachLeadLifecycle({ sbSelect, sbPatch });
    if (sweep.archived || sweep.purged) {
      console.log(`Lifecycle sweep: archived=${sweep.archived}, purged=${sweep.purged}`);
    }
  } catch (err) {
    console.warn(`Lifecycle sweep failed (continuing): ${err.message}`);
  }

  let trainingBlock = '';
  let operatorAvoidPatterns = [];
  try {
    const training = await loadOutreachTrainingPrompt({ sbSelect, sbInsert });
    trainingBlock = training.promptBlock;
    operatorAvoidPatterns = training.operatorAvoidPatterns || [];
    if (training.summary.active) {
      console.log(
        `Training mode: ${training.summary.signalCount} signal(s) — injecting into draft prompt`
      );
    }
    if (operatorAvoidPatterns.length) {
      console.log(`ICP operator avoid patterns: ${operatorAvoidPatterns.length}`);
    }
  } catch (err) {
    console.warn(`Training signals load failed (continuing): ${err.message}`);
  }

  // Step 8 — ICP sweep on pending queue
  try {
    const swept = await rejectPendingIcpViolations({ sbSelect, sbPatch, sbInsert }, SOURCE, {
      dryRun: cfg.dryRun,
    });
    if (swept.length) console.log(`ICP sweep: auto-rejected ${swept.length} lead(s)`);
  } catch (err) {
    console.warn(`ICP sweep failed (continuing): ${err.message}`);
  }

  const madeToday = await countTodayDrafts(sbSelect);
  const remaining = MAX_DRAFTS_PER_DAY - madeToday;
  console.log(`Drafts today: ${madeToday}/${MAX_DRAFTS_PER_DAY} (remaining: ${remaining})`);

  if (remaining <= 0) {
    console.log('Daily cap reached — exiting');
    return;
  }

  const known = await existingHandles(sbSelect);
  const queryEntries = pickQueriesForDay();
  let prospects = [];

  for (const entry of queryEntries) {
    console.log(`SERPAPI [${entry.industry}]: ${entry.searchQuery}`);
    try {
      const batch = await searchProspects(cfg.serpApiKey, entry.searchQuery, 8);
      prospects.push(...batch.map((p) => ({ ...p, _queryIndustry: entry.industry })));
    } catch (err) {
      console.warn(`SERPAPI failed for "${entry.searchQuery}": ${err.message}`);
    }
  }

  const seen = new Set();
  prospects = prospects.filter((p) => {
    const key = `${p.title}|${p.link}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Step 3 — pre-scan hard filter
  const preFiltered = [];
  for (const prospect of prospects) {
    const reason = preScanRejectReason(prospect, { operatorAvoidPatterns });
    if (reason) {
      await logIcpDrop(sbInsert, {
        reason,
        stage: 'pre_scan',
        label: prospect.title?.slice(0, 60) || 'prospect',
        dryRun: cfg.dryRun,
      });
      continue;
    }
    preFiltered.push(prospect);
  }
  prospects = preFiltered;

  console.log(`Prospects from search (after ICP pre-filter): ${prospects.length}`);

  let created = 0;
  const runMax = Number.parseInt(process.env.AXON_OUTREACH_MAX || '5', 10);
  const perRunCap = Number.isFinite(runMax) && runMax > 0 ? runMax : 5;
  const maxPerRun = Math.min(remaining, perRunCap);
  console.log(`Max this run: ${maxPerRun} (cap ${perRunCap}, daily remaining ${remaining})`);

  for (const prospect of prospects) {
    if (created >= maxPerRun) break;

    const scan = await scanProspect(cfg, prospect);
    if (scan._scan_source) {
      console.log(`Scan via ${scan._scan_source}: ${prospect.title?.slice(0, 60) || 'prospect'}`);
    }

    const scanReject = scanIcpRejectReason(scan);
    if (scanReject) {
      await logIcpDrop(sbInsert, {
        reason: scanReject,
        stage: 'scan_gate',
        label: scan.company || prospect.title,
        dryRun: cfg.dryRun,
      });
      continue;
    }

    const company = (scan.company || prospect.title || '').trim();
    if (!company || known.has(company.toLowerCase())) continue;

    const postReject = postScanRejectReason({
      company,
      sourceLink: prospect.link,
      scan,
    });
    if (postReject) {
      await logIcpDrop(sbInsert, {
        reason: postReject,
        stage: 'post_scan',
        label: company,
        dryRun: cfg.dryRun,
      });
      continue;
    }

    let draft;
    try {
      draft = await haikuScoreAndDraft(cfg, scan, prospect, trainingBlock);
    } catch (err) {
      console.warn(`Haiku draft skip: ${err.message}`);
      continue;
    }

    if ((draft.score ?? 0) < MIN_OUTREACH_SCORE) {
      await logIcpDrop(sbInsert, {
        reason: `low score (${draft.score ?? 0} < ${MIN_OUTREACH_SCORE})`,
        stage: 'post_score',
        label: company,
        dryRun: cfg.dryRun,
      });
      continue;
    }

    const channel = draft.channel === 'linkedin' ? 'linkedin' : 'email';
    const draftBody =
      channel === 'email' ? (draft.email_body || '').trim() : (draft.linkedin_dm || '').trim();
    if (!draftBody) {
      await logIcpDrop(sbInsert, {
        reason: 'empty draft body',
        stage: 'post_draft',
        label: company,
        dryRun: cfg.dryRun,
      });
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
      icp_scan: {
        icp_fit: scan.icp_fit ?? true,
        segment: scan.segment,
        industry: scan.industry,
      },
    };

    const row = {
      id: randomUUID(),
      handle: company,
      niche: scan.industry || scan.niche || prospect._queryIndustry || 'general',
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
        const draftText = formatDraftMessage(notifyLead, sid);
        await telegramSend(cfg.telegramToken, cfg.telegramChatId, draftText, false);
        await recordDraftNotification({ sbSelect, sbInsert, sbPatch }, cfg.telegramChatId, draftText);
      } catch (err) {
        console.warn(`Telegram notify failed for ${sid}: ${err.message}`);
      }
    } else {
      console.warn('Telegram not configured — draft saved to NI-Brain only');
    }

    await sleep(1500);
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
