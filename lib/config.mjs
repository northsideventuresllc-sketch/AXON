import { SUPABASE_URL } from './constants.mjs';
import { EXPECTED_BOT_USERNAME, telegramGetMe } from './telegram.mjs';

const fatal = [];

export const DEFAULT_WEBHOOK_URL =
  process.env.AXON_WEBHOOK_URL
  || 'https://workspace-northsideventuresllc-sketchs-projects.vercel.app/api/telegram-webhook';

export function requireEnv(name, value) {
  if (!value) fatal.push(name);
  return value;
}

export async function loadConfig(sbSelect) {
  async function secret(key) {
    if (process.env[key]) return process.env[key];
    const rows = await sbSelect('ni_platform_secrets', `key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    return rows?.[0]?.value || null;
  }

  const cfg = {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || await secret('SUPABASE_SERVICE_ROLE_KEY'),
    anthropicKey: process.env.ANTHROPIC_API_KEY || await secret('ANTHROPIC_API_KEY'),
    geminiKey: process.env.GEMINI_API_KEY || await secret('GEMINI_API_KEY'),
    geminiBackup: process.env.GEMINI_API_KEY_BACKUP || await secret('GEMINI_API_KEY_BACKUP'),
    serpApiKey: process.env.SERPAPI_API_KEY || await secret('SERPAPI_API_KEY'),
    resendKey: process.env.RESEND_API_KEY || await secret('RESEND_API_KEY'),
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || await secret('TELEGRAM_BOT_TOKEN'),
    telegramChatId: process.env.TELEGRAM_CHAT_ID || await secret('TELEGRAM_CHAT_ID'),
    resendFrom: process.env.RESEND_FROM_EMAIL || 'JB <jb@northsideintelligence.com>',
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

  if (cfg.telegramToken) {
    const niBrainToken = await secret('TELEGRAM_BOT_TOKEN');
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
