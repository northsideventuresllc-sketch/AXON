#!/usr/bin/env node
/**
 * AX-AD — Pull live Match Fit Meta + TikTok ad snapshots into NI-Brain.
 *
 * Usage:
 *   node scripts/axon-mf-ad-tracker-sync.mjs
 *   node scripts/axon-mf-ad-tracker-sync.mjs --days=7
 *   node scripts/axon-mf-ad-tracker-sync.mjs --day=2026-07-13
 *   AXON_DRY_RUN=1 node scripts/axon-mf-ad-tracker-sync.mjs
 *
 * Secrets (env wins over ni_platform_secrets):
 *   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY
 *   META_ADS_ACCESS_TOKEN + META_AD_ACCOUNT_ID
 *   TIKTOK_ADS_ACCESS_TOKEN + TIKTOK_ADS_ADVERTISER_ID
 * Optional Telegram notify when keys missing or sync completes:
 *   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { SUPABASE_URL } from '../lib/constants.mjs';
import {
  attributionRowsToPlatformSnapshots,
  easternDayKey,
  easternDayWindow,
  pullLivePlatformSnapshots,
} from '../lib/mf-ad-tracker.mjs';
import { telegramSend } from '../lib/telegram.mjs';

const dryRun = process.env.AXON_DRY_RUN === '1';

function parseArgs(argv) {
  /** @type {{ days: number; dayKeys: string[] | null; notify: boolean }} */
  const out = { days: 7, dayKeys: null, notify: true };
  for (const arg of argv) {
    if (arg.startsWith('--days=')) {
      out.days = Number.parseInt(arg.slice('--days='.length), 10) || 7;
    } else if (arg.startsWith('--day=')) {
      out.dayKeys = [arg.slice('--day='.length).trim()].filter(Boolean);
    } else if (arg === '--no-notify') {
      out.notify = false;
    }
  }
  return out;
}

async function secret(sbSelect, key) {
  if (process.env[key]?.trim()) return process.env[key].trim();
  const rows = await sbSelect(
    'ni_platform_secrets',
    `key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
  );
  return rows?.[0]?.value?.trim() || '';
}

async function upsertNiSnapshot(sb, row) {
  const payload = {
    platform: row.platform,
    day_key: row.dayKey,
    impressions: row.impressions,
    clicks: row.clicks,
    spend_cents: row.spendCents,
    conversions: row.conversions,
    source: row.source,
    raw_json: row.rawJson ?? null,
    updated_at: new Date().toISOString(),
  };

  if (dryRun) {
    console.log('[DRY RUN] upsert', payload.platform, payload.day_key, payload.source, {
      impressions: payload.impressions,
      clicks: payload.clicks,
      spend_cents: payload.spend_cents,
    });
    return;
  }

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/mf_ad_platform_daily_snapshots?on_conflict=platform,day_key,source`,
    {
      method: 'POST',
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${sb.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    },
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`NI-Brain upsert failed: HTTP ${r.status} ${text.slice(0, 240)}`);
  }
}

/**
 * Best-effort read of Match Fit on-site attribution via Match Fit Supabase REST
 * when MATCHFIT_SUPABASE_URL + MATCHFIT_SUPABASE_SERVICE_KEY are present.
 * Falls back to empty (AXON agent / MCP can seed attribution separately).
 */
async function fetchMatchFitAttribution(dayKeys, cfg) {
  const url = cfg.matchfitSupabaseUrl?.replace(/\/$/, '');
  const key = cfg.matchfitServiceKey;
  if (!url || !key || !dayKeys.length) return [];

  const start = [...dayKeys].sort()[0];
  const endExclusive = new Date(`${[...dayKeys].sort().at(-1)}T00:00:00Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 2);

  const filter =
    `select=createdAt,utmSource,utmMedium,utmCampaign,kind,visitorId` +
    `&createdAt=gte.${start}T00:00:00Z` +
    `&createdAt=lt.${endExclusive.toISOString()}` +
    `&or=(utmSource.not.is.null,utmCampaign.not.is.null)` +
    `&limit=5000`;

  const r = await fetch(`${url}/rest/v1/site_analytics_events?${filter}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!r.ok) {
    console.warn(`Match Fit attribution fetch HTTP ${r.status} — skipping site UTM mirror`);
    return [];
  }
  const events = await r.json();
  /** @type {Map<string, { day_et: string; utm_source: string; utm_medium: string; utm_campaign: string; page_views: number; visitors: Set<string> }>} */
  const agg = new Map();
  for (const ev of events) {
    if (ev.kind && ev.kind !== 'PAGE_VIEW') continue;
    const created = ev.createdAt || ev.created_at;
    if (!created) continue;
    const day_et = easternDayKey(new Date(created));
    if (!dayKeys.includes(day_et)) continue;
    const utm_source = ev.utmSource || ev.utm_source || 'direct';
    const utm_medium = ev.utmMedium || ev.utm_medium || '(none)';
    const utm_campaign = ev.utmCampaign || ev.utm_campaign || '(none)';
    const keyRow = `${day_et}|${utm_source}|${utm_medium}|${utm_campaign}`;
    const prev = agg.get(keyRow) || {
      day_et,
      utm_source,
      utm_medium,
      utm_campaign,
      page_views: 0,
      visitors: new Set(),
    };
    prev.page_views += 1;
    if (ev.visitorId || ev.visitor_id) prev.visitors.add(String(ev.visitorId || ev.visitor_id));
    agg.set(keyRow, prev);
  }
  return [...agg.values()].map((r) => ({
    day_et: r.day_et,
    utm_source: r.utm_source,
    utm_medium: r.utm_medium,
    utm_campaign: r.utm_campaign,
    page_views: r.page_views,
    unique_visitors: r.visitors.size,
  }));
}

function formatUsd(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required');
  }

  const client = createSupabaseClient(serviceKey);
  const sb = { ...client, key: serviceKey };

  const [
    metaToken,
    metaAccount,
    tiktokToken,
    tiktokAdvertiser,
    telegramToken,
    telegramChatId,
    matchfitSupabaseUrl,
    matchfitServiceKey,
  ] = await Promise.all([
    secret(client.sbSelect, 'META_ADS_ACCESS_TOKEN'),
    secret(client.sbSelect, 'META_AD_ACCOUNT_ID'),
    secret(client.sbSelect, 'TIKTOK_ADS_ACCESS_TOKEN'),
    secret(client.sbSelect, 'TIKTOK_ADS_ADVERTISER_ID'),
    secret(client.sbSelect, 'TELEGRAM_BOT_TOKEN'),
    secret(client.sbSelect, 'TELEGRAM_CHAT_ID'),
    secret(client.sbSelect, 'MATCHFIT_SUPABASE_URL'),
    secret(client.sbSelect, 'MATCHFIT_SUPABASE_SERVICE_KEY'),
  ]);

  const dayKeys = args.dayKeys || easternDayWindow(args.days);
  console.log(`[AX-AD] Pulling Meta+TikTok snapshots for days: ${dayKeys.join(', ')}`);

  const pull = await pullLivePlatformSnapshots({
    dayKeys,
    meta: { accessToken: metaToken, adAccountId: metaAccount },
    tiktok: { accessToken: tiktokToken, advertiserId: tiktokAdvertiser },
  });

  for (const snap of pull.snapshots) {
    await upsertNiSnapshot(sb, snap);
  }

  let attributionSnaps = [];
  try {
    const attrRows = await fetchMatchFitAttribution(dayKeys, {
      matchfitSupabaseUrl,
      matchfitServiceKey,
    });
    attributionSnaps = attributionRowsToPlatformSnapshots(attrRows).map((s) => ({
      ...s,
      source: 'site_attribution',
    }));
    for (const snap of attributionSnaps) {
      await upsertNiSnapshot(sb, snap);
    }
    if (attrRows.length) {
      console.log(`[AX-AD] Mirrored ${attributionSnaps.length} site-attribution platform/day rows from ${attrRows.length} UTM groups`);
    }
  } catch (e) {
    console.warn('[AX-AD] Attribution mirror skipped:', e instanceof Error ? e.message : e);
  }

  const missing = [...pull.missing.meta, ...pull.missing.tiktok];
  const apiSpend = pull.snapshots.reduce((n, s) => n + s.spendCents, 0);
  const jul13Attr = attributionSnaps.filter((s) => s.dayKey === '2026-07-13');
  const jul13Views = jul13Attr.reduce((n, s) => n + s.clicks, 0);

  const summaryLines = [
    `[AXON] AX-AD Ad Tracker pull`,
    `Days: ${dayKeys.join(', ')}`,
    `API synced: ${pull.synced.length ? pull.synced.join(', ') : 'none'}`,
    pull.synced.length ? `API spend (window): ${formatUsd(apiSpend)}` : null,
    attributionSnaps.length
      ? `Site UTM mirror: ${attributionSnaps.length} platform/day rows` +
        (jul13Views ? ` · Jul 13 attributed page views ≈ ${jul13Views}` : '')
      : 'Site UTM mirror: not available (set MATCHFIT_SUPABASE_* or seed via MCP)',
    missing.length
      ? `Secrets UI (JB): add ${missing.join(', ')} to ni_platform_secrets and/or Vercel matchfit production, then re-run Actions → AXON MF Ad Tracker Sync`
      : 'All Meta+TikTok API keys present',
    Object.keys(pull.errors).length
      ? `API errors: ${Object.entries(pull.errors)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ')}`
      : null,
  ].filter(Boolean);

  for (const line of summaryLines) console.log(line);

  if (args.notify && telegramToken && telegramChatId && (missing.length || pull.synced.length || attributionSnaps.length)) {
    await telegramSend(telegramToken, telegramChatId, summaryLines.join('\n'), dryRun);
  }

  if (missing.length && !pull.synced.length) {
    // Soft-fail so GitHub Action stays green while secrets are pending — exit 0 with clear summary.
    console.log('[AX-AD] Exit 0 — waiting on Meta/TikTok API secrets for spend snapshots');
  }
}

main().catch((err) => {
  console.error('[AX-AD] FATAL', err);
  process.exit(1);
});
