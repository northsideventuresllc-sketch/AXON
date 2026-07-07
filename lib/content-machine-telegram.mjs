/**
 * Content Machine — Telegram batch approve flow (CM6)
 * Reads pending_approval posts from NI-Brain, sends batch previews, handles approve/reject/regen.
 */
import { randomUUID } from 'node:crypto';
import { shortId } from './constants.mjs';
import {
  telegramAnswerCallbackQuery,
  telegramSend,
  telegramSendWithKeyboard,
} from './telegram.mjs';

const BRAND_LABELS = {
  'match-fit': 'Match Fit',
  ni: 'NORTHSiDE',
  northside: 'NORTHSiDE',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Video posts display as Reel in MF context */
function formatPostType(postType) {
  if (postType === 'Video') return 'Reel';
  return postType || 'Post';
}

function brandLabel(slug) {
  return BRAND_LABELS[slug] || slug?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Brand';
}

function batchKey(posts) {
  const bid = posts[0]?.batch_id;
  if (bid) return shortId(bid);
  return shortId(posts[0]?.id);
}

export function extractHookLine(caption) {
  if (!caption) return '(no caption)';
  const line = caption.split('\n').map((l) => l.trim()).find(Boolean) || '';
  const hook = line.replace(/^#+\s*/, '');
  if (hook.length <= 90) return hook;
  return `${hook.slice(0, 87)}…`;
}

export function resolveBatchId(posts, batchShort) {
  const bid = posts[0]?.batch_id;
  if (bid && shortId(bid) === batchShort) return bid;
  if (!bid && shortId(posts[0]?.id) === batchShort) return null;
  return posts.find((p) => p.batch_id && shortId(p.batch_id) === batchShort)?.batch_id ?? null;
}

export async function fetchPendingPosts(sbSelect, { batchId = null } = {}) {
  let filter = 'status=eq.pending_approval&select=*&order=day_index.asc,created_at.asc';
  if (batchId) filter += `&batch_id=eq.${encodeURIComponent(batchId)}`;
  return sbSelect('content_machine_posts', filter);
}

export async function groupPendingBatches(sbSelect) {
  const posts = await fetchPendingPosts(sbSelect);
  const batches = new Map();
  for (const post of posts) {
    const key = post.batch_id || `solo:${post.id}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(post);
  }
  return batches;
}

export async function findPostByShortId(sbSelect, sid, { pendingOnly = true } = {}) {
  let filter = 'select=*&order=created_at.desc&limit=200';
  if (pendingOnly) filter = `status=eq.pending_approval&${filter}`;
  const rows = await sbSelect('content_machine_posts', filter);
  return (rows || []).find((r) => shortId(r.id) === sid || r.id === sid) || null;
}

export async function findBatchPosts(sbSelect, batchShort) {
  const batches = await groupPendingBatches(sbSelect);
  for (const [, posts] of batches) {
    if (batchKey(posts) === batchShort) return posts;
  }
  return [];
}

function themeLine(posts) {
  const theme = posts[0]?.theme_name;
  const dayIndex = posts[0]?.day_index;
  const weekday = dayIndex != null ? WEEKDAYS[new Date().getUTCDay()] : null;
  if (theme && weekday) return `${weekday} ${theme}`;
  if (theme) return theme;
  if (weekday) return weekday;
  return 'Content batch';
}

export function formatBatchPreviewMessage(posts) {
  const brand = brandLabel(posts[0]?.brand_slug);
  const count = posts.length;
  const lines = [
    `📱 ${brand} — ${themeLine(posts)} (${count} post${count === 1 ? '' : 's'})`,
    '',
  ];

  posts.forEach((post, i) => {
    const type = formatPostType(post.post_type);
    const hook = extractHookLine(post.caption);
    const thumb = post.image_url ? ' 🖼' : '';
    lines.push(`${i + 1}/${count} ${type} — ${hook}${thumb}`);
  });

  lines.push('');
  lines.push('Tap a button below, or use /content for slash commands.');
  return lines.join('\n').slice(0, 4000);
}

export function buildBatchInlineKeyboard(posts) {
  const bk = batchKey(posts);
  const rows = [
    [{ text: '✅ Approve all', callback_data: `cm:aa:${bk}` }],
  ];

  const actionRows = posts.map((post, i) => {
    const sid = shortId(post.id);
    const n = i + 1;
    return [
      { text: `✅ #${n}`, callback_data: `cm:ap:${sid}` },
      { text: `🔄 Regen #${n}`, callback_data: `cm:rg:${sid}` },
      { text: `❌ #${n}`, callback_data: `cm:rp:${sid}` },
    ];
  });

  rows.push(...actionRows.slice(0, 4));
  rows.push([{ text: '❌ Reject batch', callback_data: `cm:rb:${bk}` }]);
  return { inline_keyboard: rows };
}

export async function writeContentSignal(sbInsert, {
  postId,
  brandSlug,
  signalType,
  originalText = null,
  editedText = null,
  meta = {},
}) {
  await sbInsert('content_machine_signals', {
    id: randomUUID(),
    post_id: postId,
    brand_slug: brandSlug,
    signal_type: signalType,
    original_text: originalText,
    edited_text: editedText,
    meta: { source: 'axon_telegram', ...meta },
  });
}

async function patchPost(sbPatch, postId, fields) {
  return sbPatch('content_machine_posts', `id=eq.${postId}`, {
    ...fields,
    updated_at: new Date().toISOString(),
  });
}

export async function approvePost(sb, post, { actor = 'jb' } = {}) {
  const { sbInsert, sbPatch } = sb;
  await patchPost(sbPatch, post.id, { status: 'approved' });
  await writeContentSignal(sbInsert, {
    postId: post.id,
    brandSlug: post.brand_slug,
    signalType: 'APPROVED',
    originalText: post.caption,
    meta: { actor, batch_id: post.batch_id },
  });
}

export async function approveAllInBatch(sb, posts, { actor = 'jb' } = {}) {
  for (const post of posts) {
    await approvePost(sb, post, { actor });
  }
}

export async function rejectPost(sb, post, { actor = 'jb', reason = null } = {}) {
  const { sbInsert, sbPatch } = sb;
  await patchPost(sbPatch, post.id, { status: 'rejected' });
  await writeContentSignal(sbInsert, {
    postId: post.id,
    brandSlug: post.brand_slug,
    signalType: 'REJECTED',
    originalText: post.caption,
    meta: { actor, reason, batch_id: post.batch_id },
  });
}

export async function rejectBatch(sb, posts, { actor = 'jb', reason = 'batch_rejected' } = {}) {
  for (const post of posts) {
    await rejectPost(sb, post, { actor, reason });
  }
}

export async function requestRegen(sb, post, { actor = 'jb', reason = null } = {}) {
  const { sbInsert, sbPatch } = sb;
  await patchPost(sbPatch, post.id, { status: 'draft' });
  await writeContentSignal(sbInsert, {
    postId: post.id,
    brandSlug: post.brand_slug,
    signalType: 'REGENERATED',
    originalText: post.caption,
    meta: { actor, reason, batch_id: post.batch_id },
  });
}

export async function editPostCaption(sb, post, newCaption, { actor = 'jb' } = {}) {
  const { sbInsert, sbPatch } = sb;
  const trimmed = newCaption.trim();
  if (!trimmed) throw new Error('Edited caption cannot be empty.');

  await patchPost(sbPatch, post.id, { caption: trimmed, status: 'approved' });
  await writeContentSignal(sbInsert, {
    postId: post.id,
    brandSlug: post.brand_slug,
    signalType: 'EDIT_DIFF',
    originalText: post.caption,
    editedText: trimmed,
    meta: { actor, batch_id: post.batch_id },
  });
}

export async function contentMachineSummary(sbSelect) {
  const posts = await fetchPendingPosts(sbSelect);
  const batches = await groupPendingBatches(sbSelect);
  const byBrand = {};
  for (const post of posts) {
    const b = post.brand_slug || 'unknown';
    byBrand[b] = (byBrand[b] || 0) + 1;
  }
  return {
    pendingPosts: posts.length,
    pendingBatches: batches.size,
    byBrand,
  };
}

export function contentStatusMessage(summary) {
  const { pendingPosts, pendingBatches, byBrand } = summary;
  const lines = [
    'Content Machine approval queue:',
    '',
    `Posts waiting: ${pendingPosts}`,
    `Batches waiting: ${pendingBatches}`,
  ];

  if (pendingPosts === 0) {
    lines.push('', 'Nothing to approve right now. New batches land after the daily Content Machine run.');
  } else {
    const brands = Object.entries(byBrand)
      .map(([slug, n]) => `${brandLabel(slug)}: ${n}`)
      .join(' · ');
    lines.push('', brands);
    lines.push('', 'Send /content to preview batches with approve buttons.');
  }

  return lines.join('\n');
}

export function parseContentCallback(data) {
  if (!data?.startsWith('cm:')) return null;
  const [, action, id] = data.split(':');
  if (!action || !id) return null;
  return { action, id };
}

export async function handleContentCallback(cfg, sb, callbackQuery) {
  const { sbSelect, sbInsert, sbPatch } = sb;
  const parsed = parseContentCallback(callbackQuery.data);
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

  let reply;
  try {
    const { action, id } = parsed;

    if (action === 'aa') {
      const posts = await findBatchPosts(sbSelect, id);
      if (!posts.length) {
        reply = `No pending posts found for batch ${id}. Maybe already approved?`;
      } else {
        await approveAllInBatch({ sbInsert, sbPatch }, posts);
        reply = `Approved all ${posts.length} post${posts.length === 1 ? '' : 's'} in the ${brandLabel(posts[0].brand_slug)} batch. They are in the schedule queue.`;
      }
    } else if (action === 'ap') {
      const post = await findPostByShortId(sbSelect, id);
      if (!post) {
        reply = `Post ${id} not found or already handled.`;
      } else {
        await approvePost({ sbInsert, sbPatch }, post);
        reply = `Approved ${formatPostType(post.post_type)} #${(post.day_index ?? 0) + 1} — "${extractHookLine(post.caption)}".`;
      }
    } else if (action === 'rp') {
      const post = await findPostByShortId(sbSelect, id);
      if (!post) {
        reply = `Post ${id} not found or already handled.`;
      } else {
        await rejectPost({ sbInsert, sbPatch }, post);
        reply = `Rejected ${formatPostType(post.post_type)} post ${id}.`;
      }
    } else if (action === 'rb') {
      const posts = await findBatchPosts(sbSelect, id);
      if (!posts.length) {
        reply = `No pending posts in batch ${id}.`;
      } else {
        await rejectBatch({ sbInsert, sbPatch }, posts);
        reply = `Rejected the full ${brandLabel(posts[0].brand_slug)} batch (${posts.length} posts).`;
      }
    } else if (action === 'rg') {
      const post = await findPostByShortId(sbSelect, id);
      if (!post) {
        reply = `Post ${id} not found or already handled.`;
      } else {
        await requestRegen({ sbInsert, sbPatch }, post);
        reply = `Regen queued for ${formatPostType(post.post_type)} post ${id}. Content Machine will redraft it.`;
      }
    } else {
      reply = 'Unknown content action.';
    }
  } catch (err) {
    reply = `Content action failed: ${err.message}`;
  }

  await telegramAnswerCallbackQuery(cfg.telegramToken, queryId, reply?.slice(0, 200) || 'Done');

  if (reply && !cfg.dryRun) {
    await telegramSend(cfg.telegramToken, chatId, reply, false);
  }

  return reply;
}

export async function sendBatchNotification(cfg, sb, posts) {
  const { sbSelect, sbInsert, sbPatch } = sb;
  const text = formatBatchPreviewMessage(posts);
  const keyboard = buildBatchInlineKeyboard(posts);

  if (!cfg.dryRun) {
    await telegramSendWithKeyboard(cfg.telegramToken, cfg.telegramChatId, text, keyboard, false);
  } else {
    console.log(`[DRY RUN] Content batch notify:\n${text}`);
  }

  for (const post of posts) {
    const meta = { ...(post.meta || {}), telegram_notified: true, telegram_notified_at: new Date().toISOString() };
    await sbPatch('content_machine_posts', `id=eq.${post.id}`, { meta });
  }

  return text;
}

export async function buildContentCommandReply(cfg, sb, parsed) {
  const { sbSelect, sbInsert, sbPatch } = sb;
  const { cmd, arg, rest } = parsed;

  if (cmd === '/content') {
    const batches = await groupPendingBatches(sbSelect);
    if (batches.size === 0) {
      return 'No content batches waiting for approval. Check back after the daily Content Machine run.';
    }

    let sent = 0;
    for (const [, posts] of batches) {
      const notified = posts.every((p) => p.meta?.telegram_notified);
      if (!notified || arg === 'refresh') {
        await sendBatchNotification(cfg, { sbSelect, sbInsert, sbPatch }, posts);
        sent++;
      }
    }

    if (sent === 0) {
      return `${batches.size} batch${batches.size === 1 ? '' : 'es'} pending — previews already sent. Tap the buttons above or use:\n/content_approve <id>\n/content_reject <id>\n/content_regen <id>\n/content_edit <id> <new caption>`;
    }
    return `Sent ${sent} batch preview${sent === 1 ? '' : 's'}. Tap the buttons to approve, regen, or reject.`;
  }

  if (cmd === '/content_status') {
    const summary = await contentMachineSummary(sbSelect);
    return contentStatusMessage(summary);
  }

  if (cmd === '/content_approve_all') {
    if (!arg) return 'Usage: /content_approve_all <batch-id> — the 8-char code from the batch message.';
    const posts = await findBatchPosts(sbSelect, arg);
    if (!posts.length) return `No pending batch with id ${arg}.`;
    await approveAllInBatch({ sbInsert, sbPatch }, posts);
    return `Approved all ${posts.length} posts in batch ${arg}.`;
  }

  if (cmd === '/content_approve') {
    if (!arg) return 'Usage: /content_approve <post-id> — the 8-char code for one post.';
    const post = await findPostByShortId(sbSelect, arg);
    if (!post) return `Post ${arg} not found.`;
    await approvePost({ sbInsert, sbPatch }, post);
    return `Approved ${formatPostType(post.post_type)} — "${extractHookLine(post.caption)}".`;
  }

  if (cmd === '/content_reject') {
    if (!arg) return 'Usage: /content_reject <post-id>';
    const post = await findPostByShortId(sbSelect, arg);
    if (!post) return `Post ${arg} not found.`;
    await rejectPost({ sbInsert, sbPatch }, post);
    return `Rejected post ${arg}.`;
  }

  if (cmd === '/content_reject_batch') {
    if (!arg) return 'Usage: /content_reject_batch <batch-id>';
    const posts = await findBatchPosts(sbSelect, arg);
    if (!posts.length) return `No pending batch ${arg}.`;
    await rejectBatch({ sbInsert, sbPatch }, posts);
    return `Rejected batch ${arg} (${posts.length} posts).`;
  }

  if (cmd === '/content_regen') {
    if (!arg) return 'Usage: /content_regen <post-id>';
    const post = await findPostByShortId(sbSelect, arg);
    if (!post) return `Post ${arg} not found.`;
    await requestRegen({ sbInsert, sbPatch }, post);
    return `Regen queued for post ${arg}.`;
  }

  if (cmd === '/content_edit') {
    if (!arg) return 'Usage: /content_edit <post-id> <your new caption>';
    const post = await findPostByShortId(sbSelect, arg);
    if (!post) return `Post ${arg} not found.`;
    if (!rest?.trim()) {
      return `Send your edited caption after the id:\n/content_edit ${arg} Your new caption here`;
    }
    await editPostCaption({ sbInsert, sbPatch }, post, rest);
    return `Saved your edit and approved post ${arg}.`;
  }

  return null;
}
