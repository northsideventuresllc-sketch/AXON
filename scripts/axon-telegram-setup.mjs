#!/usr/bin/env node
/**
 * Register AXON slash commands with BotFather API and optionally set webhook.
 *
 * Usage:
 *   node scripts/axon-telegram-setup.mjs              # register slash commands only
 *   node scripts/axon-telegram-setup.mjs --webhook https://your-domain/api/telegram-webhook
 *   node scripts/axon-telegram-setup.mjs --auto          # register commands + set default Vercel webhook
 *   node scripts/axon-telegram-setup.mjs --polling     # remove webhook (use GitHub cron poll)
 *   node scripts/axon-telegram-setup.mjs --agent arceus  # set up a per-agent bot (or AXON_TELEGRAM_AGENT env)
 *
 * TELEGRAM-WEBHOOK-SECRET-DEPLOY-0924: api/telegram-webhook.js fails CLOSED
 * (401) unless the inbound `x-telegram-bot-api-secret-token` header matches
 * the secret resolved by lib/config.mjs's loadTelegramConfig() — env override
 * first, then NI-Brain `ni_platform_secrets` (per-agent suffix aware). This
 * script used to resolve the webhook's registered secret_token from
 * `process.env.TELEGRAM_WEBHOOK_SECRET` ONLY, with no NI-Brain fallback and
 * no per-agent suffix support. The on-deploy workflow
 * (.github/workflows/axon-telegram-webhook-on-deploy.yml) never set that env
 * var, so every push to main that touched the webhook path silently
 * re-registered the webhook with NO secret_token — after which Telegram sent
 * every button tap and message with no secret header, and the handler
 * rejected all of them with 401. Root-caused live 2026-09-24 via Telegram's
 * getWebhookInfo showing last_error "Wrong response from the webhook: 401
 * Unauthorized". Fixed by resolving the secret the SAME way the handler
 * does — cfg.telegramWebhookSecret, sourced from loadConfig()/
 * loadTelegramConfig() (env override still wins, DB is the real source of
 * truth, per-agent suffix honored) — and by refusing to ever call
 * setWebhook without a resolved secret, so a misconfigured deploy fails the
 * job instead of silently breaking every button.
 */
import { loadConfig, DEFAULT_WEBHOOK_URL } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { BOT_COMMANDS } from '../lib/telegram-commands.mjs';
import {
  telegramDeleteWebhook,
  telegramGetWebhookInfo,
  telegramSetCommands,
  telegramSetWebhook,
} from '../lib/telegram.mjs';

// --agent <KEY> / env AXON_TELEGRAM_AGENT selects a per-agent bot (falls back
// to the shared default bot when that agent has no dedicated bot provisioned
// — see TELEGRAM-PER-AGENT-BOT-0827 in lib/config.mjs).
export function resolveAgentKey(argv = process.argv) {
  const flagIdx = argv.indexOf('--agent');
  if (flagIdx !== -1 && argv[flagIdx + 1]) return argv[flagIdx + 1];
  const eqArg = argv.find((a) => a.startsWith('--agent='));
  if (eqArg) return eqArg.split('=')[1];
  return process.env.AXON_TELEGRAM_AGENT || undefined;
}

export function resolveWebhookArg(argv = process.argv) {
  const explicitWebhook = argv.find((a) => a.startsWith('--webhook='))?.split('=')[1]
    || (argv.includes('--webhook') ? argv[argv.indexOf('--webhook') + 1] : null);
  const usePolling = argv.includes('--polling');
  const useAuto = argv.includes('--auto');
  const webhookArg = explicitWebhook || (useAuto ? (process.env.AXON_WEBHOOK_URL || DEFAULT_WEBHOOK_URL) : null);
  return { webhookArg, usePolling, useAuto };
}

/**
 * Core logic, dependency-injected for testing. `deps` defaults to the real
 * Telegram/Supabase calls; tests override them with fakes/mocks.
 */
export async function runSetup(argv = process.argv, deps = {}) {
  const {
    createSupabaseClient: createSb = createSupabaseClient,
    loadConfig: doLoadConfig = loadConfig,
    telegramSetCommands: setCommands = telegramSetCommands,
    telegramDeleteWebhook: deleteWebhook = telegramDeleteWebhook,
    telegramSetWebhook: setWebhook = telegramSetWebhook,
    telegramGetWebhookInfo: getWebhookInfo = telegramGetWebhookInfo,
    log = console.log,
    warn = console.warn,
  } = deps;

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { sbSelect } = createSb(key);
  const agentKey = resolveAgentKey(argv);
  const cfg = await doLoadConfig(sbSelect, agentKey);

  if (!cfg.telegramToken) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }

  const { webhookArg, usePolling } = resolveWebhookArg(argv);

  log('Registering AXON slash commands with Telegram…');
  await setCommands(cfg.telegramToken, BOT_COMMANDS);
  log('Slash commands registered:', BOT_COMMANDS.map((c) => `/${c.command}`).join(', '));

  if (usePolling) {
    log('Removing webhook — using polling mode');
    await deleteWebhook(cfg.telegramToken);
  } else if (webhookArg) {
    // Resolved the SAME way api/telegram-webhook.js resolves it (env
    // override, then NI-Brain, per-agent suffix aware via loadConfig's
    // loadTelegramConfig call) — never process.env.TELEGRAM_WEBHOOK_SECRET
    // read in isolation, and never a bare `|| null` fallback. A webhook is
    // NEVER registered without a secret_token: doing so would make the
    // handler reject every real Telegram request too, since it checks the
    // same resolved secret against the inbound header.
    if (!cfg.telegramWebhookSecret) {
      throw new Error(
        'TELEGRAM_WEBHOOK_SECRET could not be resolved (checked env override and '
        + `ni_platform_secrets${agentKey ? ` for agent "${agentKey}"` : ''}) — refusing to `
        + 'register a webhook with no secret_token. The handler fails closed (401) on every '
        + 'request without one, so this would silently break every button/message. Set the '
        + `secret in NI-Brain ni_platform_secrets (or TELEGRAM_WEBHOOK_SECRET${agentKey ? `_${agentKey.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')}` : ''} env) first.`
      );
    }
    log(`Setting webhook: ${webhookArg}`);
    await setWebhook(cfg.telegramToken, webhookArg, cfg.telegramWebhookSecret);
  } else {
    log('Commands only — webhook unchanged. Use --auto, --webhook <url>, or --polling.');
  }

  const info = await getWebhookInfo(cfg.telegramToken);
  // Never print the token or secret — getWebhookInfo's response never
  // includes secret_token (Telegram doesn't echo it back), only url/
  // pending_update_count/last_error_*, so logging the whole object is safe.
  log('Webhook info:', JSON.stringify(info, null, 2));

  if (info?.last_error_message && /401|unauthorized/i.test(info.last_error_message)) {
    warn(
      `WARNING: Telegram reports a recent 401/unauthorized delivery failure: "${info.last_error_message}" `
      + '(last_error_date: ' + (info.last_error_date || 'unknown') + '). If this webhook was just '
      + 'registered above, the secret_token may not match what api/telegram-webhook.js resolves for '
      + 'this deploy — verify TELEGRAM_WEBHOOK_SECRET in ni_platform_secrets before assuming buttons work.'
    );
  } else {
    log(`Webhook url: ${info?.url || '(none)'} — pending updates: ${info?.pending_update_count ?? 'unknown'}`);
  }

  log('Done. JB can open the bot in Telegram and type / to see commands.');
  return { cfg, info };
}

async function main() {
  await runSetup(process.argv);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error('AXON telegram setup failed:', err.message);
    process.exit(1);
  });
}
