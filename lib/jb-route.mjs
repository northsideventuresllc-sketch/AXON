/**
 * Where a JB-facing Telegram message goes — TELEGRAM-ROUTING-FIX-0905.
 *
 * Decision #1696 (JB, 2026-09-02): one bot, one "NVG Agents" forum group, one
 * topic per agent. JB's private chat keeps ONLY the 10pm daily wrap and the
 * AXON chat conversation. Everything else an agent sends lands in that
 * agent's topic.
 *
 * TELEGRAM-RETIRE-APPROVALS-TOPIC-0924 (Decision #2012, 2026-09-24): the
 * shared "JB Approvals" group topic is retired — every approval now goes to
 * JB's private chat (`fn_telegram_approval_ping` on NI-Brain already sends
 * DM-only; see its TELEGRAM-APPROVALS-TO-DM-0924 header note). This resolver
 * had a dead second path (`opts.approvals && approvalsThread` below) that
 * still routed approvals to the group topic if a caller ever passed
 * `approvals: true` — no live caller does, but the branch contradicted
 * Decision #2012 and would have silently misrouted any future approvals
 * caller back to the retired topic. Removed rather than left as a trap.
 *
 * Falls back to the private chat only when the group is not provisioned.
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
 * @param {{ agentName?: string, approvals?: boolean }} opts
 * @returns {Promise<{ chatId: string|null, threadId: number|null, viaGroup: boolean }>}
 */
export async function resolveJbTarget(sbSelect, opts = {}) {
  // TELEGRAM-RETIRE-APPROVALS-TOPIC-0924 (Decision #2012): an approvals ask
  // ALWAYS goes to JB's private chat now, full stop — never the group, even
  // if a group + approvals-thread secret happen to still be provisioned.
  // This must be checked before the `!group` short-circuit below so it wins
  // regardless of whether the group itself is configured.
  if (opts.approvals) {
    const dmOnly = await secret(sbSelect, 'TELEGRAM_CHAT_ID');
    return { chatId: dmOnly || null, threadId: null, viaGroup: false };
  }

  const [dm, group] = await Promise.all([
    secret(sbSelect, 'TELEGRAM_CHAT_ID'),
    secret(sbSelect, 'TELEGRAM_GROUP_CHAT_ID'),
  ]);
  if (!group) return { chatId: dm || null, threadId: null, viaGroup: false };

  const thread =
    (await agentThreadId(sbSelect, opts.agentName)) ??
    (await agentThreadId(sbSelect, DEFAULT_TOPIC_AGENT));
  if (thread != null) return { chatId: group, threadId: thread, viaGroup: true };
  return { chatId: dm || null, threadId: null, viaGroup: false };
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
