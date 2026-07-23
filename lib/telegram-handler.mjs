/**
 * Shared Telegram update handler — used by poll script and webhook.
 */
import { axonChatReply, buildPipelineContext } from './axon-telegram-chat.mjs';
import { rejectOutreachLeadWithClient } from './outreach-reject-core.mjs';
import { leadHadDraftEdits, logOutreachApproveSignal } from './outreach-learn-core.mjs';
import { resendSend } from './resend.mjs';
import {
  getOrCreateConversation,
  loadRecentHistory,
  saveMessage,
} from './telegram-conversations.mjs';
import {
  buildContentCommandReply,
  contentMachineSummary,
  handleContentCallback,
} from './content-machine-telegram.mjs';
import {
  actionVerb,
  parseOutreachCallback,
  parseRewriteCommand,
  rewriteCommandTemplate,
} from './match-fit-outreach-event.mjs';
import {
  approveOutreachLead,
  deleteOutreachLead,
  describeActionResult,
  rewriteOutreachLead,
} from './match-fit-outreach-actions.mjs';
import {
  parseCommand,
  telegramAnswerCallbackQuery,
  telegramSend,
} from './telegram.mjs';
import { welcomeMessage, statusMessage } from './telegram-commands.mjs';

const COMMAND_WITH_ID = new Set(['/approve', '/reject', '/sent_li']);
const CONTENT_COMMANDS = new Set([
  '/content',
  '/content_status',
  '/content_approve',
  '/content_approve_all',
  '/content_reject',
  '/content_reject_batch',
  '/content_regen',
  '/content_edit',
]);

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

async function handleApprove(cfg, sb, lead) {
  const { sbPatch, sbInsert, sbSelect } = sb;
  const meta = parseNotes(lead.notes);
  if (meta.channel === 'linkedin') {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    const edited = await leadHadDraftEdits(sbSelect, lead.id);
    await logOutreachApproveSignal(sbInsert, lead.id, { operatorId: 'telegram', edited });
    return `Done — I marked ${lead.handle} as approved for LinkedIn. Copy the DM from the draft message and send it yourself, then tell me /sent_li ${shortId(lead.id)} when it's out.`;
  }

  const to = meta.contact_email;
  if (!to) {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    const edited = await leadHadDraftEdits(sbSelect, lead.id);
    await logOutreachApproveSignal(sbInsert, lead.id, { operatorId: 'telegram', edited });
    return `I approved ${shortId(lead.id)}, but there's no email address on file. You'll need to reach them on LinkedIn or add their email in NI-Brain.`;
  }

  if (!cfg.resendKey) {
    await sbPatch('ni_brain_outreach', `id=eq.${lead.id}`, { status: 'approved' });
    const edited = await leadHadDraftEdits(sbSelect, lead.id);
    await logOutreachApproveSignal(sbInsert, lead.id, { operatorId: 'telegram', edited });
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

  const edited = await leadHadDraftEdits(sbSelect, lead.id);
  await logOutreachApproveSignal(sbInsert, lead.id, { operatorId: 'telegram', edited });

  return `Email sent to ${to} for ${lead.handle}. You're all set on that one.`;
}

async function buildCommandReply(cfg, sb, parsed) {
  const { sbSelect, sbInsert, sbPatch } = sb;
  const { cmd, arg } = parsed;

  if (cmd === '/start' || cmd === '/help') {
    return welcomeMessage();
  }

  if (cmd === '/status') {
    const s = await pipelineSummary(sbSelect);
    const cm = await contentMachineSummary(sbSelect);
    return statusMessage(s, cm);
  }

  if (CONTENT_COMMANDS.has(cmd)) {
    const contentReply = await buildContentCommandReply(cfg, sb, parsed);
    if (contentReply) return contentReply;
  }

  if (cmd === '/mf_rewrite') {
    const rw = parseRewriteCommand(parsed.raw);
    if (!rw) {
      return 'Usage: /mf_rewrite <ig|fb|em>:<leadId> <your new copy>\nTap Rewrite on a lead to get the ready-made command.';
    }
    const result = await rewriteOutreachLead(rw);
    return describeActionResult('rewrite', `${rw.platform} lead`, result);
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

  if (cmd === '/approve') return handleApprove(cfg, sb, lead);
  if (cmd === '/reject') {
    const reason = parsed.rest?.trim() || null;
    await rejectOutreachLeadWithClient(sb, lead.id, {
      reason,
      operatorId: 'telegram',
      source: 'telegram',
    });
    const suffix = reason ? ` Reason noted: ${reason}` : '';
    return `Got it — I removed ${lead.handle} from the pipeline.${suffix}`;
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
  // Preserve the raw text — parseCommand lowercases arg, but Match Fit leadIds are
  // case-sensitive (cuids), so /mf_rewrite re-parses from the original string.
  if (parsed) parsed.raw = text;

  let reply;
  try {
    if (parsed) {
      await saveMessage(sbInsert, sbPatch, conversation.id, {
        role: 'user',
        content: text,
        messageType: 'command',
        telegramMessageId: msg.message_id,
      });
      reply = await buildCommandReply(cfg, sb, parsed);
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
        sbSelect,
      });
    }
  } catch (err) {
    console.error('handleTelegramMessage failed:', err.message);
    reply = "Something went wrong on my end. Try again in a moment, or check /status.";
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

export async function handleTelegramCallback(cfg, sb, callbackQuery) {
  const data = callbackQuery?.data;
  if (typeof data !== 'string') return null;
  if (data.startsWith('cm:')) return handleContentCallback(cfg, sb, callbackQuery);
  if (data.startsWith('mf:')) return handleOutreachCallback(cfg, callbackQuery);
  return null;
}

/**
 * Match Fit outreach lead buttons: Approve / Delete / Rewrite.
 * Approve + Delete call back into Match Fit (see match-fit-outreach-actions.mjs — currently
 * blocked on a missing Match Fit-side service-token auth path). Rewrite starts a one-shot
 * text-capture flow via the /mf_rewrite slash command (mirrors the content_edit idiom;
 * the repo has no persistent multi-step await-state store).
 */
export async function handleOutreachCallback(cfg, callbackQuery) {
  const parsed = parseOutreachCallback(callbackQuery.data);
  const chatId = String(callbackQuery.message?.chat?.id);
  const queryId = callbackQuery.id;

  if (!parsed) {
    await telegramAnswerCallbackQuery(cfg.telegramToken, queryId, 'Unknown action');
    return null;
  }
  if (cfg.telegramChatId && chatId !== String(cfg.telegramChatId)) {
    await telegramAnswerCallbackQuery(cfg.telegramToken, queryId, 'Unauthorized');
    return null;
  }

  const { action, platform, leadId } = parsed;
  const label = `${platform} lead`;
  let reply;

  try {
    if (action === 'ap') {
      const result = await approveOutreachLead({ platform, leadId });
      reply = describeActionResult('approve', label, result);
    } else if (action === 'dl') {
      const result = await deleteOutreachLead({ platform, leadId });
      reply = describeActionResult('delete', label, result);
    } else if (action === 'rw') {
      reply =
        `To rewrite this ${platform} lead, reply with your new copy after this command ` +
        `(copy it, then type your text):\n\n${rewriteCommandTemplate(platform, leadId)}`;
    } else {
      reply = 'Unknown outreach action.';
    }
  } catch (err) {
    console.error('handleOutreachCallback failed:', err.message);
    reply = `That ${actionVerb(action)} failed on my end. Try again in a moment.`;
  }

  await telegramAnswerCallbackQuery(cfg.telegramToken, queryId, reply?.slice(0, 200) || 'Done');
  if (reply && !cfg.dryRun) {
    await telegramSend(cfg.telegramToken, chatId, reply, false);
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
