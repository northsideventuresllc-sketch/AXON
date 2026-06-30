#!/usr/bin/env node
/**
 * AXON Telegram command handler — polls for JB approve/reject/sent_li
 */
import { loadConfig } from '../lib/config.mjs';
import { SOURCE, parseNotes, shortId } from '../lib/constants.mjs';
import { resendSend } from '../lib/resend.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { parseCommand, telegramGetUpdates, telegramSend } from '../lib/telegram.mjs';

const OFFSET_KEY = 'AXON_TELEGRAM_OFFSET';

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
    return `✅ Approved ${shortId(lead.id)} (LinkedIn). Copy the DM and send manually, then /sent_li ${shortId(lead.id)}`;
  }

  const to = meta.contact_email;
  if (!to) {
    return `⚠️ ${shortId(lead.id)} approved but no contact_email in notes. Add email manually or use LinkedIn.`;
  }

  if (!cfg.resendKey) {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    return `✅ Approved ${shortId(lead.id)} but RESEND_API_KEY missing — send manually.`;
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

  return `📤 Sent email to ${to} for ${lead.handle} (${shortId(lead.id)})`;
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

  for (const update of updates) {
    nextOffset = Math.max(nextOffset, update.update_id + 1);
    const msg = update.message;
    if (!msg?.text || String(msg.chat.id) !== String(cfg.telegramChatId)) continue;

    const parsed = parseCommand(msg.text);
    if (!parsed) continue;

    const { cmd, arg } = parsed;
    let reply;

    try {
      if (cmd === '/status') {
        const s = await pipelineSummary(sbSelect);
        reply = [
          '📊 AXON NI pipeline',
          `Total: ${s.total}`,
          `Pending approval: ${s.pending}`,
          `Closed won: ${s.won}/4`,
          `By status: ${JSON.stringify(s.counts)}`,
        ].join('\n');
      } else if (!arg) {
        reply = 'Usage: /approve <id> · /reject <id> · /sent_li <id> · /status';
      } else {
        const lead = await findLeadByShortId(sbSelect, arg);
        if (!lead) {
          reply = `❌ Lead not found: ${arg}`;
        } else if (cmd === '/approve') {
          reply = await handleApprove(cfg, sbPatch, lead);
        } else if (cmd === '/reject') {
          await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'dead' });
          reply = `🗑 Rejected ${lead.handle} (${shortId(lead.id)})`;
        } else if (cmd === '/sent_li') {
          await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, {
            status: 'sent',
            dm_sent: true,
          });
          reply = `✅ Marked LinkedIn sent for ${lead.handle} (${shortId(lead.id)})`;
        } else {
          reply = `Unknown command: ${cmd}`;
        }
      }
    } catch (err) {
      reply = `❌ Error: ${err.message}`;
    }

    if (reply) {
      await telegramSend(cfg.telegramToken, cfg.telegramChatId, reply, cfg.dryRun);
    }
  }

  if (nextOffset !== offset && !cfg.dryRun) {
    await saveOffset(sbUpsertSecret, nextOffset);
  }

  console.log(`Processed ${updates.length} update(s). Offset: ${nextOffset}`);
}

main().catch((err) => {
  console.error('❌ AXON telegram poll failed:', err.message);
  process.exit(1);
});
