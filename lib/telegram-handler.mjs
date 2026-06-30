/**
 * Shared Telegram update handler — used by poll script and webhook.
 */
import { axonChatReply, buildPipelineContext } from './axon-chat.mjs';
import { SOURCE, parseNotes, shortId } from './constants.mjs';
import { resendSend } from './resend.mjs';
import {
  getOrCreateConversation,
  loadRecentHistory,
  saveMessage,
} from './telegram-conversations.mjs';
import { parseCommand, telegramSend } from './telegram.mjs';
import { welcomeMessage, statusMessage } from './telegram-commands.mjs';

const COMMAND_WITH_ID = new Set(['/approve', '/reject', '/sent_li']);

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
  return {
    total: rows?.length || 0,
    pending: counts.pending_approval || 0,
    won: counts.closed_won || 0,
    counts,
  };
}

async function handleApprove(cfg, sbPatch, lead) {
  const meta = parseNotes(lead.notes);
  if (meta.channel === 'linkedin') {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    return `Done — I marked ${lead.handle} as approved for LinkedIn. Copy the DM from the draft message and send it yourself, then tell me /sent_li ${shortId(lead.id)} when it's out.`;
  }

  const to = meta.contact_email;
  if (!to) {
    return `I approved ${shortId(lead.id)}, but there's no email address on file. You'll need to reach them on LinkedIn or add their email in NI-Brain.`;
  }

  if (!cfg.resendKey) {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    return `Approved ${shortId(lead.id)}, but email sending isn't set up yet. You'll need to send it manually for now.`;
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

  return `Email sent to ${to} for ${lead.handle}. You're all set on that one.`;
}

async function buildCommandReply(cfg, sbSelect, sbPatch, parsed) {
  const { cmd, arg } = parsed;

  if (cmd === '/start' || cmd === '/help') {
    return welcomeMessage();
  }

  if (cmd === '/status') {
    const s = await pipelineSummary(sbSelect);
    return statusMessage(s);
  }

  if (cmd === '/new') {
    return "Fresh start — just talk to me normally. I'll remember what we discuss in this session. Your full history is always on the AXON dashboard.";
  }

  if (COMMAND_WITH_ID.has(cmd) && !arg) {
    return `I need the lead ID for that. It’s the 8-character code at the top of each draft message.\n\nExample: ${cmd} a1b2c3d4`;
  }

  if (!COMMAND_WITH_ID.has(cmd)) {
    return "I didn't recognize that command. Send /help to see what I can do, or just talk to me like a normal chat.";
  }

  const lead = await findLeadByShortId(sbSelect, arg);
  if (!lead) return `I couldn't find a lead with ID "${arg}". Double-check the code from the draft message.`;

  if (cmd === '/approve') return handleApprove(cfg, sbPatch, lead);
  if (cmd === '/reject') {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'dead' });
    return `Got it — I removed ${lead.handle} from the pipeline.`;
  }
  if (cmd === '/sent_li') {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'sent', dm_sent: true });
    return `Marked the LinkedIn message for ${lead.handle} as sent. Nice work.`;
  }

  return `Unknown command: ${cmd}`;
}

export async function handleTelegramMessage(cfg, sb, msg) {
  const { sbSelect, sbInsert, sbPatch } = sb;
  const text = msg.text?.trim();
  if (!text) return null;

  const chatId = String(msg.chat.id);
  if (cfg.telegramChatId && chatId !== String(cfg.telegramChatId)) {
    return null;
  }

  const conversation = await getOrCreateConversation(sbSelect, sbInsert, sbPatch, chatId);
  const parsed = parseCommand(text);

  let reply;
  try {
    if (parsed) {
      await saveMessage(sbInsert, sbPatch, conversation.id, {
        role: 'user',
        content: text,
        messageType: 'command',
        telegramMessageId: msg.message_id,
      });
      reply = await buildCommandReply(cfg, sbSelect, sbPatch, parsed);
    } else {
      const history = await loadRecentHistory(sbSelect, conversation.id, 16);
      await saveMessage(sbInsert, sbPatch, conversation.id, {
        role: 'user',
        content: text,
        messageType: 'chat',
        telegramMessageId: msg.message_id,
      });
      const pipelineContext = await buildPipelineContext(sbSelect);
      reply = await axonChatReply(cfg, {
        userMessage: text,
        history: history.filter((h) => h.role === 'user' || h.role === 'assistant'),
        pipelineContext,
      });
    }
  } catch (err) {
    reply = `Something went wrong on my end: ${err.message}. Try again in a moment, or check /status.`;
  }

  if (reply) {
    await saveMessage(sbInsert, sbPatch, conversation.id, {
      role: 'assistant',
      content: reply,
      messageType: parsed ? 'command' : 'chat',
    });

    if (!cfg.dryRun) {
      await telegramSend(cfg.telegramToken, chatId, reply, false);
    }
  }

  return reply;
}

export async function recordDraftNotification(sb, chatId, text) {
  const { sbSelect, sbInsert, sbPatch } = sb;
  const conversation = await getOrCreateConversation(sbSelect, sbInsert, sbPatch, chatId);
  await saveMessage(sbInsert, sbPatch, conversation.id, {
    role: 'assistant',
    content: text,
    messageType: 'draft_notification',
  });
}
