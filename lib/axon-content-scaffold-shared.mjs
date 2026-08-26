/**
 * Shared helpers for the three AXON content-scaffold jobs built 2026-08-26
 * (JB direct order): Content-Batch-Creation, Social Media Research, SEO Tracker.
 *
 * ZERO-EXTERNAL-CALL PASS: this file (and every script that imports it) must
 * never call a social platform API, an SEO data API, or any host outside
 * NVG's own Supabase/GitHub. Real credentials for those are not wired in yet.
 * Where a real integration would need one, the caller self-reports
 * NEEDS_CREDENTIALS and stops cleanly — see needsCredentials() below.
 *
 * Deliberately does NOT reuse lib/config.mjs's loadConfig(), because that
 * function hard-fails if ANTHROPIC_API_KEY is missing — irrelevant to these
 * jobs, which do no LLM calls in this pass by design.
 */
import { SUPABASE_URL } from './constants.mjs';
import { createSupabaseClient } from './supabase.mjs';
import { telegramSend } from './telegram.mjs';

/** Minimal config: only what these internal-data-only jobs actually need. */
export async function loadScaffoldConfig(sbSelect) {
  async function secret(key) {
    if (process.env[key]) return process.env[key];
    const rows = await sbSelect(
      'ni_platform_secrets',
      `key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    );
    return rows?.[0]?.value || null;
  }
  return {
    supabaseKey:
      process.env.SUPABASE_SERVICE_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || (await secret('SUPABASE_SERVICE_ROLE_KEY')),
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || (await secret('TELEGRAM_BOT_TOKEN')),
    telegramChatId: process.env.TELEGRAM_CHAT_ID || (await secret('TELEGRAM_CHAT_ID')),
    dryRun: process.env.AXON_DRY_RUN === '1',
  };
}

export function buildClient(supabaseKey) {
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — cannot run');
  return createSupabaseClient(supabaseKey);
}

/**
 * Soft time-box. Standing rule (JB, 2026-08-26): on hitting a time limit,
 * note it needs to resume within ~12h, don't just die silently.
 * Mirrors the pattern already live in lib/axon-executive-agent.mjs.
 */
export function startTimeBudget(minutes = 8) {
  const startedAt = Date.now();
  const limitMs = minutes * 60 * 1000;
  return {
    expired: () => Date.now() - startedAt > limitMs,
    elapsedSec: () => Math.round((Date.now() - startedAt) / 1000),
  };
}

/** Bump axon_cron_jobs.next_run_at so the job knows to pick back up inside ~12h. */
export async function scheduleResumeIn12h(sb, jobId) {
  const next = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  try {
    await sb.sbPatch('axon_cron_jobs', `id=eq.${encodeURIComponent(jobId)}`, {
      next_run_at: next,
      last_run_summary: `Hit time budget — resume scheduled within ~12h (by ${next}). Loop-engineered: no partial/fake data written.`,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`scheduleResumeIn12h: could not patch axon_cron_jobs (${err.message}) — non-fatal`);
  }
}

/**
 * Plain-English, ADHD-friendly, light-emoji message builder.
 * No jargon, no table names, no file paths — human-facing text only.
 */
export function plainEnglish(lines) {
  return lines.filter(Boolean).join('\n');
}

/** Urgent-for-JB messages go ONLY via Telegram, never Slack/email/anywhere else. */
export async function notifyJbUrgent(cfg, text) {
  if (!cfg.telegramToken || !cfg.telegramChatId) {
    console.log('Telegram not configured — cannot send urgent JB alert (logged here instead):');
    console.log(text);
    return { ok: false, reason: 'no_telegram_config' };
  }
  return telegramSend(cfg.telegramToken, cfg.telegramChatId, text, cfg.dryRun);
}

/** Write one row to agent_bus. Every job in this file addresses the Executive Agent by default. */
export async function writeAgentBus(sb, { from_agent, to_agent = 'AXON Executive Agent', subject, body, needs_answer = false }) {
  return sb.sbInsert('agent_bus', {
    from_agent,
    to_agent,
    subject,
    body,
    needs_answer,
    status: 'open',
    created_at: new Date().toISOString(),
  });
}

/**
 * The self-report contract for every place a real external API call would
 * normally go in these scaffolds. Never simulate fake data here — say
 * plainly what's missing and stop that one unit of work cleanly.
 */
export function needsCredentials(platformOrSource) {
  return `NEEDS_CREDENTIALS: ${platformOrSource} access not configured`;
}

/** Pull the real, live venture/brand list — never hardcode it. */
export async function loadVentureList(sbSelect) {
  const rows = await sbSelect(
    'content_machine_brand_profiles',
    'select=slug,name,venture&order=slug.asc',
  );
  return rows || [];
}

export { SUPABASE_URL };
