/**
 * Where a JB-facing Telegram message goes — TELEGRAM-APPROVALS-TO-DM-0924.
 *
 * NI-Brain Decision #2012 (JB live, 2026-09-24): JB was not reliably seeing
 * cards posted to the NVG Agents forum group's per-agent topics or its
 * shared "JB Approvals" topic — every JB-facing message (NEEDS APPROVAL /
 * BROKE / FINISHED / DAILY WRAP; the four classes in the boot contract) now
 * goes to his PRIVATE chat with the bot instead. This supersedes Decision
 * #1696 (2026-09-02)'s "one topic per agent, approvals in the approvals
 * topic" routing for every call through resolveJbTarget/sendToJb — this
 * function exists ONLY to resolve where a message meant for JB goes, so it
 * is DM-first now, full stop. Agent-to-agent chatter that is NOT meant for
 * JB is not routed through this function at all and may still use the group
 * via its own path.
 *
 * Falls back to the group's topic only when the private chat itself is not
 * provisioned at all, so a JB-facing message is never silently dropped.
 */

const DEFAULT_TOPIC_AGENT = 'EXEC';

async function secret(sbSelect, key) {
  if (process.env[key]) return process.env[key];
  try {
    const rows = await sbSelect('ni_platform_secrets', `key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    return rows?.[0]?.value || null;
  } catch {
    return null;
  }
}

async function agentThreadId(sbSelect, agentName) {
  if (!agentName) return null;
  try {
    const rows = await sbSelect(
      'nvg_agent_routines',
      `agent_name=eq.${encodeURIComponent(agentName)}&select=telegram_thread_id&limit=1`,
    );
    const t = rows?.[0]?.telegram_thread_id;
    return t != null ? Number(t) : null;
  } catch {
    return null;
  }
}

/**
 * @param {(table: string, query: string) => Promise<any[]>} sbSelect
 * @param {{ agentName?: string, approvals?: boolean }} opts — `approvals` is
 *   accepted but no longer changes the result: every JB-facing send is
 *   DM-first now, approvals included. Kept so existing callers that still
 *   pass `{ approvals: true }` need no code change.
 * @returns {Promise<{ chatId: string|null, threadId: number|null, viaGroup: boolean }>}
 */
export async function resolveJbTarget(sbSelect, opts = {}) {
  const [dm, group] = await Promise.all([
    secret(sbSelect, 'TELEGRAM_CHAT_ID'),
    secret(sbSelect, 'TELEGRAM_GROUP_CHAT_ID'),
  ]);
  if (dm) return { chatId: dm, threadId: null, viaGroup: false };

  // Private chat not provisioned at all — fall back to the group's topic so
  // a JB-facing message is never silently dropped. The approvals topic is
  // being retired (TELEGRAM-RETIRE-APPROVALS-TOPIC-0924), so this fallback
  // no longer special-cases opts.approvals — it always uses the same
  // agent-topic (EXEC default) resolution.
  if (!group) return { chatId: null, threadId: null, viaGroup: false };
  const thread =
    (await agentThreadId(sbSelect, opts.agentName)) ??
    (await agentThreadId(sbSelect, DEFAULT_TOPIC_AGENT));
  return { chatId: group, threadId: thread ?? null, viaGroup: true };
}

/** One-shot plain sendMessage to the resolved target. Returns true on ok. */
export async function sendToJb(sbSelect, text, opts = {}) {
  const token = await secret(sbSelect, 'TELEGRAM_BOT_TOKEN');
  const target = await resolveJbTarget(sbSelect, opts);
  if (!token || !target.chatId) return false;
  const body = { chat_id: target.chatId, text, disable_web_page_preview: true };
  if (target.threadId != null) body.message_thread_id = target.threadId;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return !!data.ok;
}
