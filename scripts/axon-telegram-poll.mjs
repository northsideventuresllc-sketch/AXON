#!/usr/bin/env node
/**
 * AXON Telegram command handler — polls for JB approve/reject/sent_li
 */
import { loadConfig } from '../lib/config.mjs';
import { SOURCE, parseNotes, shortId } from '../lib/constants.mjs';
import { resendSend } from '../lib/resend.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { parseCommand, telegramGetUpdates, telegramSend } from '../lib/telegram.mjs';
import { welcomeMessage } from '../lib/telegram-commands.mjs';

const OFFSET_KEY = 'AXON_TELEGRAM_OFFSET';
const COMMAND_WITH_ID = new Set(['/approve', '/reject', '/sent_li']);

async function loadOffset(sbSelect) {
  const rows = await sbSelect(
    'ni_platform_secrets',
    `key=eq.${OFFSET_KEY}&select=value&limit=1`
  );
  const val = rows?.[0]?.value;
  return val ? Number(val) : 0;
}

async function saveOffset(sbUpsertSecret, offset) {
  await sbUpsertSecret(OFFSET_KEY, String(offset));
}

async function findLeadByShortId(sbSelect, sid) {
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&select=*&order=created_at.desc&limit=100`
  );
  return (rows || []).find((r) => shortId(r.id) === sid || r.id === sid);
}

async function pipelineSummary(sbSelect) {
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&select=status&limit=500`
  );
  const counts = {};
  for (const r of rows || []) {
    const s = r.status || 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  }
  const pending = counts.pending_approval || 0;
  const won = counts.closed_won || 0;
  return { total: rows?.length || 0, pending, won, counts };
}

async function handleApprove(cfg, sbPatch, lead) {
  const meta = parseNotes(lead.notes);
  if (meta.channel === 'linkedin') {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    return `Approved ${shortId(lead.id)} (LinkedIn). Copy the DM and send manually, then /sent_li ${shortId(lead.id)}`;
  }

  const to = meta.contact_email;
  if (!to) {
    return `${shortId(lead.id)} approved but no contact_email in notes. Use LinkedIn or edit in NI-Brain.`;
  }

  if (!cfg.resendKey) {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    return `Approved ${shortId(lead.id)} but RESEND_API_KEY missing — send manually.`;
  }

  const subject = meta.email_subject || `NORTHSiDE Intelligence — ${lead.handle}`;
  await resendSend(cfg, {
    to,
    subject,
    html: lead.comment_draft || '',
  });

  await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, {
    status: 'sent',
    dm_sent: true,
  });

  return `Sent email to ${to} for ${lead.handle} (${shortId(lead.id)})`;
}

async function buildReply(cfg, sbSelect, sbPatch, parsed, rawText) {
  const { cmd, arg } = parsed;

  if (cmd === '/start' || cmd === '/help') {
    return welcomeMessage();
  }

  if (cmd === '/status') {
    const s = await pipelineSummary(sbSelect);
    return [
      'AXON NI pipeline',
      `Total: ${s.total}`,
      `Pending approval: ${s.pending}`,
      `Closed won: ${s.won}/4`,
      s.total === 0
        ? 'No drafts yet — run AXON NI Outreach in GitHub Actions or wait for tonight.'
        : `By status: ${JSON.stringify(s.counts)}`,
    ].join('\n');
  }

  if (COMMAND_WITH_ID.has(cmd) && !arg) {
    return `Usage: ${cmd} <id>  (id is the 8-char code on each draft message)`;
  }

  if (!COMMAND_WITH_ID.has(cmd)) {
    return `Unknown command. Send /help for AXON commands.`;
  }

  const lead = await findLeadByShortId(sbSelect, arg);
  if (!lead) return `Lead not found: ${arg}`;

  if (cmd === '/approve') return handleApprove(cfg, sbPatch, lead);
  if (cmd === '/reject') {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'dead' });
    return `Rejected ${lead.handle} (${shortId(lead.id)})`;
  }
  if (cmd === '/sent_li') {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'sent', dm_sent: true });
    return `Marked LinkedIn sent for ${lead.handle} (${shortId(lead.id)})`;
  }

  return `Unknown command: ${cmd}`;
}

async function main() {
  console.log(`AXON Telegram poll — ${new Date().toISOString()}`);
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect, sbPatch, sbUpsertSecret } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);

  if (!cfg.telegramToken || !cfg.telegramChatId) {
    console.log('Telegram not configured — exiting');
    return;
  }

  const offset = await loadOffset(sbSelect);
  const updates = await telegramGetUpdates(cfg.telegramToken, offset || undefined);
  let nextOffset = offset;
  let replied = 0;

  for (const update of updates) {
    nextOffset = Math.max(nextOffset, update.update_id + 1);
    const msg = update.message;
    if (!msg?.text || String(msg.chat.id) !== String(cfg.telegramChatId)) continue;

    const parsed = parseCommand(msg.text);
    let reply;

    try {
      if (parsed) {
        reply = await buildReply(cfg, sbSelect, sbPatch, parsed, msg.text);
      } else {
        reply = 'AXON heard you. Try /help or /status.';
      }
    } catch (err) {
      reply = `Error: ${err.message}`;
    }

    if (reply) {
      await telegramSend(cfg.telegramToken, cfg.telegramChatId, reply, cfg.dryRun);
      replied++;
    }

    if (!cfg.dryRun) {
      await saveOffset(sbUpsertSecret, nextOffset);
    }
  }

  if (nextOffset !== offset && !cfg.dryRun && replied === 0) {
    await saveOffset(sbUpsertSecret, nextOffset);
  }

  console.log(`Processed ${updates.length} update(s), replied ${replied}. Offset: ${nextOffset}`);
}

main().catch((err) => {
  console.error('AXON telegram poll failed:', err.message);
  process.exit(1);
});
