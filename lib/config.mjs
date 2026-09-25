import { SUPABASE_URL } from './constants.mjs';
import { EXPECTED_BOT_USERNAME, telegramGetMe } from './telegram.mjs';

const fatal = [];

export const DEFAULT_WEBHOOK_URL =
  process.env.AXON_WEBHOOK_URL
  || 'https://axon-northsideventuresllc-sketchs-projects.vercel.app/api/telegram-webhook';

export function requireEnv(name, value) {
  if (!value) fatal.push(name);
  return value;
}

async function secret(sbSelect, key) {
  if (process.env[key]) return process.env[key];
  const rows = await sbSelect('ni_platform_secrets', `key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
  return rows?.[0]?.value || null;
}

/**
 * TELEGRAM-PER-AGENT-BOT-0827: resolve token/chat/secret for a named agent's
 * own bot (env `TELEGRAM_BOT_TOKEN_<KEY>` / NI-Brain secret of the same name),
 * falling back to the single shared AXON bot when no agent-specific bot has
 * been provisioned yet. agentKey is normalized upper-snake so callers can pass
 * 'arceus', 'ARCEUS', etc. Passing no agentKey reproduces the pre-existing
 * single-bot lookup exactly.
 *
 * The agent fallback is atomic: an agent bot is only used once it has its
 * own token, chat AND webhook secret all provisioned together (one BotFather
 * setup). A partial set never mixes with the default bot's credentials —
 * that would pair one bot's identity with another bot's secret — so an
 * agent with only some fields set falls back to the default bot entirely.
 */
export async function loadTelegramConfig(agentKey, sbSelect) {
  const [defaultToken, defaultChatId, defaultWebhookSecret, groupChatId, approvalsThreadId] = await Promise.all([
    secret(sbSelect, 'TELEGRAM_BOT_TOKEN'),
    secret(sbSelect, 'TELEGRAM_CHAT_ID'),
    secret(sbSelect, 'TELEGRAM_WEBHOOK_SECRET'),
    secret(sbSelect, 'TELEGRAM_GROUP_CHAT_ID'),
    secret(sbSelect, 'TELEGRAM_APPROVALS_THREAD_ID'),
  ]);
  // TELEGRAM-APPROVALS-TO-DM-0924 (NI-Brain Decision #2012, JB live 2026-09-24):
  // JB was not reliably seeing cards posted to the NVG Agents group's
  // Approvals topic, so every JB-facing Telegram path — including this
  // webhook's inbound authorization and the button-tap handlers in
  // telegram-handler.mjs / nvg-approve-telegram.mjs — now targets his
  // PRIVATE chat with the bot (TELEGRAM_CHAT_ID) by default, never the
  // group+topic, regardless of whether the group and approvals-thread
  // secrets are provisioned. telegramGroupChatId / telegramApprovalsThreadId
  // are still resolved and returned below for any agent-to-agent chatter
  // that is NOT JB-facing and may legitimately stay in the group; they no
  // longer feed telegramChatId. Supersedes the AGENT-COMMS-TELEGRAM-
  // STANDARD-0903 precedence, which preferred the group+topic once both were
  // provisioned — that is the exact behavior JB asked to retire.
  // TELEGRAM-ROUTING-FIX-0905 (JB live, 2026-09-05) still applies: JB's
  // private chat stays a valid inbound chat (see isAuthorizedChat in
  // telegram-auth.mjs) alongside the group, so a stray group message is not
  // silently dropped either.
  const defaults = {
    telegramToken: defaultToken,
    telegramChatId: defaultChatId,
    telegramDmChatId: defaultChatId || null,
    telegramGroupChatId: groupChatId || null,
    telegramWebhookSecret: defaultWebhookSecret,
    telegramApprovalsThreadId: approvalsThreadId || null,
  };

  if (!agentKey) return defaults;

  const suffix = `_${agentKey.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  const [agentToken, agentChatId, agentWebhookSecret] = await Promise.all([
    secret(sbSelect, `TELEGRAM_BOT_TOKEN${suffix}`),
    secret(sbSelect, `TELEGRAM_CHAT_ID${suffix}`),
    secret(sbSelect, `TELEGRAM_WEBHOOK_SECRET${suffix}`),
  ]);

  if (agentToken && agentChatId && agentWebhookSecret) {
    return { telegramToken: agentToken, telegramChatId: agentChatId, telegramWebhookSecret: agentWebhookSecret };
  }
  return defaults;
}

export async function loadConfig(sbSelect, agentKey, precomputedTelegram) {
  const telegram = precomputedTelegram || await loadTelegramConfig(agentKey, sbSelect);

  const cfg = {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || await secret(sbSelect, 'SUPABASE_SERVICE_ROLE_KEY'),
    anthropicKey: process.env.ANTHROPIC_API_KEY || await secret(sbSelect, 'ANTHROPIC_API_KEY'),
    geminiKey: process.env.GEMINI_API_KEY || await secret(sbSelect, 'GEMINI_API_KEY'),
    geminiBackup: process.env.GEMINI_API_KEY_BACKUP || await secret(sbSelect, 'GEMINI_API_KEY_BACKUP'),
    // '-latest' rolling alias or production-ready fast model — see AXON-GEMINI-STALE-MODEL-0909.
    geminiModel: process.env.GEMINI_MODEL || await secret(sbSelect, 'GEMINI_MODEL') || 'gemini-2.5-flash',
    serpApiKey: process.env.SERPAPI_API_KEY || await secret(sbSelect, 'SERPAPI_API_KEY'),
    resendKey: process.env.RESEND_API_KEY || await secret(sbSelect, 'RESEND_API_KEY'),
    telegramToken: telegram.telegramToken,
    telegramChatId: telegram.telegramChatId,
    telegramDmChatId: telegram.telegramDmChatId || null,
    telegramGroupChatId: telegram.telegramGroupChatId || null,
    telegramWebhookSecret: telegram.telegramWebhookSecret,
    telegramApprovalsThreadId: telegram.telegramApprovalsThreadId || null,
    resendFrom: process.env.RESEND_FROM_EMAIL || 'JB <jb@northsideintelligence.com>',
    resendReplyTo: process.env.RESEND_REPLY_TO_EMAIL || 'jb@northsideintelligence.com',
    dryRun: process.env.AXON_DRY_RUN === '1',
  };

  requireEnv('SUPABASE_SERVICE_KEY', cfg.supabaseKey);
  requireEnv('ANTHROPIC_API_KEY', cfg.anthropicKey);

  if (!cfg.geminiKey && !cfg.geminiBackup) {
    console.warn('GEMINI_API_KEY missing — prospect scans will use Haiku/SERP fallback only');
  }
  if (!cfg.serpApiKey) {
    console.warn('SERPAPI_API_KEY missing — no prospect discovery');
  }

  if (fatal.length) {
    throw new Error(`AXON config missing:\n${fatal.map((f) => `  - ${f}`).join('\n')}`);
  }

  if (!agentKey && cfg.telegramToken) {
    // EXPECTED_BOT_USERNAME is the default shared bot's identity — this
    // self-correction only makes sense for that bot, not a per-agent one.
    // Must read NI-Brain directly (bypassing env) — comparing against
    // `telegram.telegramToken` (which already prefers env) would make this
    // comparison always equal cfg.telegramToken and never fire.
    const niBrainRows = await sbSelect('ni_platform_secrets', 'key=eq.TELEGRAM_BOT_TOKEN&select=value&limit=1');
    const niBrainToken = niBrainRows?.[0]?.value || null;
    if (niBrainToken && cfg.telegramToken !== niBrainToken) {
      try {
        const me = await telegramGetMe(cfg.telegramToken);
        if (me.username !== EXPECTED_BOT_USERNAME) {
          console.warn(
            `TELEGRAM_BOT_TOKEN env is @${me.username}, expected @${EXPECTED_BOT_USERNAME} — using NI-Brain token`
          );
          cfg.telegramToken = niBrainToken;
        }
      } catch {
        console.warn('TELEGRAM_BOT_TOKEN env invalid — using NI-Brain token');
        cfg.telegramToken = niBrainToken;
      }
    }
  }

  return cfg;
}
