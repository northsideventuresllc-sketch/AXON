#!/usr/bin/env node
/**
 * Backup Telegram tap receiver for the Mac mini (host stays primary).
 *
 * Run once a minute from cron (NOT a daemon):
 *   * * * * * cd ~/nvg/repos/AXON && node scripts/telegram-backup-poll.mjs --apply
 *
 * Telegram allows webhook OR getUpdates, never both, so this switches modes:
 *   host down (2 probes)  -> deleteWebhook, poll getUpdates, feed the SAME
 *                            handlers api/telegram-webhook.js uses
 *   host back, mode=backup -> setWebhook (WITH secret_token), stop polling
 *   host up, otherwise     -> do nothing
 *
 * Default is dry-run (no mutating Telegram call, no handler). Enable with
 * --apply or TELEGRAM_BACKUP_APPLY=1. State: ~/nvg/state/telegram-backup.json
 * (override with TELEGRAM_BACKUP_STATE). Never prints tokens or secrets.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, loadTelegramConfig, DEFAULT_WEBHOOK_URL } from '../lib/config.mjs';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { handleTelegramCallback, handleTelegramMessage } from '../lib/telegram-handler.mjs';
import { telegramDeleteWebhook, telegramGetWebhookInfo, telegramSetWebhook } from '../lib/telegram.mjs';

const TELEGRAM_API = 'https://api.telegram.org/bot';
const SEEN_MAX = 100;
const MAX_ATTEMPTS = 2;

export const HELP = `Usage: node scripts/telegram-backup-poll.mjs [--apply] [--dry-run] [--help]
Backup Telegram tap receiver. One short run per minute from cron.
  --apply     act (or env TELEGRAM_BACKUP_APPLY=1); default is dry-run
  --dry-run   print the decision only, call nothing mutating
Env: AXON_WEBHOOK_URL (host URL to probe), TELEGRAM_BACKUP_STATE (state file path)
State file: ~/nvg/state/telegram-backup.json {mode, offset, since}`;

export function defaultStatePath(env = process.env) {
  return env.TELEGRAM_BACKUP_STATE || path.join(os.homedir(), 'nvg', 'state', 'telegram-backup.json');
}

export function readState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return s && typeof s === 'object' ? s : {};
  } catch {
    return {};
  }
}

export function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

/** Healthy host answers 405/401/etc. DOWN = 402, 5xx, timeout, connection/TLS error. */
export async function probeHost(url, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { method: 'GET', signal: ctl.signal, redirect: 'manual' });
    return !(r.status === 402 || r.status >= 500);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function defaultGetUpdates(token, offset, fetchImpl = globalThis.fetch) {
  const params = new URLSearchParams({
    timeout: '0',
    limit: '20',
    allowed_updates: JSON.stringify(['callback_query', 'message']),
  });
  if (offset != null) params.set('offset', String(offset));
  const r = await fetchImpl(`${TELEGRAM_API}${token}/getUpdates?${params}`);
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram getUpdates: ${data.description || r.status}`);
  return data.result || [];
}

async function handleUpdate(update, cfg, sb, handlers) {
  const chat = update?.message?.chat || update?.callback_query?.message?.chat;
  if (chat?.id && typeof sb?.sbUpsert === 'function') {
    // Same fire-and-forget chat record the webhook does; never blocks the tap.
    Promise.resolve(sb.sbUpsert('axon_telegram_chats', {
      chat_id: chat.id,
      chat_type: chat.type || 'unknown',
      title: chat.title || chat.username || chat.first_name || null,
      is_forum: Boolean(chat.is_forum),
      last_seen_at: new Date().toISOString(),
    })).catch(() => {});
  }
  if (update?.message?.text) await handlers.handleTelegramMessage(cfg, sb, update.message);
  if (update?.callback_query) await handlers.handleTelegramCallback(cfg, sb, update.callback_query);
}

/**
 * Core, dependency-injected. Returns { code, line }.
 */
export async function runBackupPoll(argv = [], deps = {}) {
  const env = deps.env || process.env;
  if (argv.includes('--help') || argv.includes('-h')) return { code: 0, line: HELP };
  const apply = !argv.includes('--dry-run') && (argv.includes('--apply') || env.TELEGRAM_BACKUP_APPLY === '1');
  const {
    loadTelegram = async () => {
      const sb = createSupabaseClient(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
      return { sb, telegram: await loadTelegramConfig(undefined, sb.sbSelect) };
    },
    loadFullCfg = async (sb, telegram) => loadConfig(sb.sbSelect, undefined, telegram),
    getWebhookInfo = telegramGetWebhookInfo,
    deleteWebhook = telegramDeleteWebhook,
    setWebhook = telegramSetWebhook,
    getUpdates = defaultGetUpdates,
    probe = probeHost,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    handlers = { handleTelegramCallback, handleTelegramMessage },
    statePath = defaultStatePath(env),
    now = () => new Date().toISOString(),
    log = () => {},
  } = deps;
  const rd = deps.readState || readState;
  const wr = deps.writeState || writeState;

  try {
    const { sb, telegram } = await loadTelegram();
    const token = telegram.telegramToken;
    if (!token) return { code: 1, line: 'telegram not configured, nothing done' };

    const state = rd(statePath);
    const info = await getWebhookInfo(token);
    const url = env.AXON_WEBHOOK_URL || info?.url || state.url || DEFAULT_WEBHOOK_URL;

    // Three probes ~3 s apart: a short blip must not make us delete the webhook.
    let up = await probe(url);
    for (let i = 0; i < 2 && !up; i++) {
      await sleep(3000);
      up = await probe(url);
    }

    // HOST UP
    if (up) {
      // Repair case: host is up but no webhook is registered (state file lost, reboot,
      // or a crash right after deleteWebhook). Re-register whatever the state says.
      const needsWebhook = state.mode === 'backup' || !info?.url;
      if (!needsWebhook) return { code: 0, line: 'host healthy, nothing to do' };
      if (!telegram.telegramWebhookSecret) {
        return { code: 1, line: 'host is back but webhook secret is missing, refusing to re-register the webhook' };
      }
      if (!apply) return { code: 0, line: 'dry-run: host is back, would re-register the webhook and stop polling' };
      await setWebhook(token, url, telegram.telegramWebhookSecret);
      wr(statePath, { ...state, mode: 'webhook', since: now(), url });
      return { code: 0, line: 'host is back, webhook re-registered, polling stopped' };
    }

    // HOST DOWN
    const webhookSet = Boolean(info?.url);
    if (!apply) {
      const what = webhookSet
        ? 'would remove the webhook and poll for taps'
        : 'webhook already off, would poll for taps';
      return { code: 0, line: `dry-run: host down, ${what}` };
    }
    let cur = { ...state, url };
    if (webhookSet || state.mode !== 'backup') {
      // Record backup mode BEFORE deleting, so a crash in between is still repaired next run.
      cur = { ...cur, mode: 'backup', since: now() };
      wr(statePath, cur);
      if (webhookSet) await deleteWebhook(token);
    }

    const cfg = await loadFullCfg(sb, telegram);
    const updates = await getUpdates(token, cur.offset);
    const seen = new Set(cur.seen || []);
    const retries = { ...(cur.retries || {}) };
    let handled = 0;
    let failed = 0;
    let maxId = cur.offset != null ? cur.offset - 1 : -1;

    const persist = () => {
      const pending = Object.keys(retries).map(Number);
      const offset = pending.length ? Math.min(...pending) : maxId + 1;
      cur = { ...cur, offset, retries, seen: [...seen].slice(-SEEN_MAX) };
      wr(statePath, cur);
    };

    for (const u of updates) {
      const id = u.update_id;
      if (seen.has(id)) {
        maxId = Math.max(maxId, id);
        persist();
        continue;
      }
      try {
        await handleUpdate(u, cfg, sb, handlers);
        seen.add(id);
        delete retries[id];
        maxId = Math.max(maxId, id);
        handled += 1;
      } catch (err) {
        failed += 1;
        const n = (retries[id] || 0) + 1;
        log(`update ${id} failed (attempt ${n}): ${err.message}`);
        if (n >= MAX_ATTEMPTS) {
          delete retries[id];
          seen.add(id);
          maxId = Math.max(maxId, id);
        } else {
          retries[id] = n;
          maxId = Math.max(maxId, id);
        }
      }
      persist();
    }
    return {
      code: failed ? 1 : 0,
      line: `host down, polling: handled ${handled} tap${handled === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`,
    };
  } catch (err) {
    return { code: 1, line: `backup poll failed: ${err.message}` };
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runBackupPoll(process.argv.slice(2), { log: console.error }).then(({ code, line }) => {
    console.log(line);
    process.exit(code);
  });
}
