import { SUPABASE_URL } from './constants.mjs';

const fatal = [];

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
    resendFrom: process.env.RESEND_FROM_EMAIL || 'Jonny <northside@northsideintelligence.com>',
    dryRun: process.env.AXON_DRY_RUN === '1',
  };

  requireEnv('SUPABASE_SERVICE_KEY', cfg.supabaseKey);
  requireEnv('ANTHROPIC_API_KEY', cfg.anthropicKey);

  if (fatal.length) {
    throw new Error(`AXON config missing:\n${fatal.map((f) => `  - ${f}`).join('\n')}`);
  }

  return cfg;
}
