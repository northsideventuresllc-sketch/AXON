#!/usr/bin/env node
/**
 * Register AXON slash commands with BotFather API and optionally set webhook.
 *
 * Usage:
 *   node scripts/axon-telegram-setup.mjs              # register slash commands only
 *   node scripts/axon-telegram-setup.mjs --webhook https://your-domain/api/telegram-webhook
 *   node scripts/axon-telegram-setup.mjs --polling     # remove webhook (use GitHub cron poll)
 */
import { loadConfig } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { BOT_COMMANDS } from '../lib/telegram-commands.mjs';
import {
  telegramDeleteWebhook,
  telegramGetWebhookInfo,
  telegramSetCommands,
  telegramSetWebhook,
} from '../lib/telegram.mjs';

async function main() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);

  if (!cfg.telegramToken) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  const webhookArg = process.argv.find((a) => a.startsWith('--webhook='))?.split('=')[1]
    || (process.argv.includes('--webhook') ? process.argv[process.argv.indexOf('--webhook') + 1] : null);
  const usePolling = process.argv.includes('--polling');

  console.log('Registering AXON slash commands with Telegram…');
  await telegramSetCommands(cfg.telegramToken, BOT_COMMANDS);
  console.log('Slash commands registered:', BOT_COMMANDS.map((c) => `/${c.command}`).join(', '));

  if (webhookArg) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || null;
    console.log(`Setting webhook: ${webhookArg}`);
    await telegramSetWebhook(cfg.telegramToken, webhookArg, secret);
  } else if (usePolling) {
    console.log('Removing webhook — using polling mode');
    await telegramDeleteWebhook(cfg.telegramToken);
  }

  const info = await telegramGetWebhookInfo(cfg.telegramToken);
  console.log('Webhook info:', JSON.stringify(info, null, 2));
  console.log('Done. JB can open the bot in Telegram and type / to see commands.');
}

main().catch((err) => {
  console.error('AXON telegram setup failed:', err.message);
  process.exit(1);
});
