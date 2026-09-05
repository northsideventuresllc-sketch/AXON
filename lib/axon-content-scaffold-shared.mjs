/**
 * Shared helpers for the AXON content-scaffold jobs built 2026-08-26
 * (JB direct order): Content-Batch-Creation, Social Media Research, SEO Tracker.
 *
 * REBUILD 2026-08-26 (JB direct correction — see Decisions): Social Media
 * Research and SEO Tracker do NOT wait on JB's own first-party social
 * credentials. They run real EXTERNAL/PUBLIC research now (SerpApi Google
 * search + Gemini/Anthropic synthesis — see lib/axon-research-synthesis.mjs)
 * and self-report NEEDS_CREDENTIALS only for the genuinely-blocked first-party
 * analytics slice (getFirstPartyAnalytics below), which stays a clearly
 * marked extension point to be filled in once JB wires NVG's own accounts.
 * Never simulate a first-party number (follower count, own-account
 * engagement, Search Console data) — that slice must say NEEDS_CREDENTIALS
 * until it is real. External research findings must be real search results,
 * never invented.
 *
 * Deliberately does NOT reuse lib/config.mjs's loadConfig(), because that
 * function hard-fails if ANTHROPIC_API_KEY is missing — these jobs want to
 * degrade gracefully (raw-search fallback) instead of hard-failing when one
 * synthesis provider is unavailable.
 */
import { SUPABASE_URL } from './constants.mjs';
import { createSupabaseClient } from './supabase.mjs';
import { telegramSend } from './telegram.mjs';

/** Minimal config: what these jobs need for real external research + synthesis. */
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
    serpApiKey: process.env.SERPAPI_API_KEY || (await secret('SERPAPI_API_KEY')),
    geminiKey: process.env.GEMINI_API_KEY || (await secret('GEMINI_API_KEY')),
    geminiBackup: process.env.GEMINI_API_KEY_BACKUP || (await secret('GEMINI_API_KEY_BACKUP')),
    geminiModel: process.env.GEMINI_MODEL || (await secret('GEMINI_MODEL')) || null,
    anthropicKey: process.env.ANTHROPIC_API_KEY || (await secret('ANTHROPIC_API_KEY')),
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
export async function writeAgentBus(sb, { from_agent, to_agent = 'AXON Executive', subject, body, needs_answer = false }) {
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
    'select=slug,name,venture,cta_paths&order=slug.asc',
  );
  return rows || [];
}

/**
 * Derive this brand's real live domain/page from its own cta_paths — never
 * hardcode a domain list. Falls back to null (caller must self-report
 * NEEDS_CREDENTIALS / skip) if no usable URL exists on the row.
 */
export function deriveDomain(brand) {
  const paths = brand?.cta_paths;
  const candidates = Array.isArray(paths)
    ? paths
    : paths && typeof paths === 'object'
      ? Object.values(paths)
      : [];
  const url = candidates.find((v) => typeof v === 'string' && /^https?:\/\//i.test(v));
  if (!url) return null;
  try {
    const u = new URL(url);
    return { hostname: u.hostname, path: u.pathname === '/' ? '' : u.pathname, url };
  } catch {
    return null;
  }
}

/**
 * EXTENSION POINT — first-party social/analytics data.
 *
 * JB direct correction 2026-08-26: external/public research must NOT wait on
 * this. This function is the clearly marked place first-party analytics gets
 * ADDED later (once NVG's own social accounts + API tokens are wired into
 * ni_platform_secrets), as an enhancement layered on top of the external
 * research below — never a rewrite. Until then it always returns a
 * NEEDS_CREDENTIALS skip and must never fabricate a follower count,
 * engagement number, or Search Console figure.
 *
 * @param {{slug:string,name:string}} brand
 * @param {string[]} sources e.g. ['Instagram','TikTok'] or ['Google Search Console']
 */
export async function getFirstPartyAnalytics(brand, sources = []) {
  return {
    available: false,
    reason: 'first_party_accounts_not_wired',
    sources: sources.map((s) => ({ source: s, status: needsCredentials(s) })),
  };
}

/** Insert one durable finding into Decisions — the same table content-batch-creation.mjs already reads (decision ILIKE brand name) as source material for future drafts. Brand name must appear in the text for that lookup to pick it up. */
export async function writeDecision(sb, { decision, status = 'active', durability = null, outcome = null }) {
  return sb.sbInsert('Decisions', {
    date: new Date().toISOString(),
    decision,
    status,
    durability,
    outcome,
    created_at: new Date().toISOString(),
  });
}

export { SUPABASE_URL };
