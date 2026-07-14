/**
 * Match Fit Ad Tracker — Meta + TikTok daily snapshot helpers (AX-AD).
 * Pure functions + fetchers; no secrets hardcoded.
 */

/** @typedef {'meta' | 'google' | 'tiktok'} AdPlatform */

/**
 * Eastern (America/New_York) calendar day YYYY-MM-DD.
 * @param {Date} [date]
 */
export function easternDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * @param {number} dayCount
 * @param {Date} [from]
 */
export function daysAgoEastern(dayCount, from = new Date()) {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() - dayCount);
  return easternDayKey(d);
}

/**
 * Inclusive Eastern day keys from `days` ago through today (newest first).
 * @param {number} days
 * @param {Date} [from]
 */
export function easternDayWindow(days, from = new Date()) {
  const n = Math.min(30, Math.max(1, Math.floor(days)));
  return Array.from({ length: n }, (_, i) => daysAgoEastern(i, from));
}

/**
 * Parse Meta insights `actions` into conversion count (pixel subscribe/register/lead).
 * @param {unknown} actions
 */
export function parseMetaConversions(actions) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    const row = /** @type {{ action_type?: string; value?: string }} */ (action);
    const type = row.action_type ?? '';
    if (
      type === 'offsite_conversion.fb_pixel_subscribe' ||
      type === 'offsite_conversion.fb_pixel_complete_registration' ||
      type === 'lead' ||
      type === 'subscribe' ||
      type === 'complete_registration'
    ) {
      total += Number.parseInt(row.value ?? '0', 10) || 0;
    }
  }
  return total;
}

/**
 * @param {string} dayKey
 * @param {{ accessToken: string; adAccountId: string }} creds
 */
export async function fetchMetaDailySnapshot(dayKey, creds) {
  const token = creds.accessToken?.trim();
  const accountRaw = creds.adAccountId?.trim();
  if (!token || !accountRaw) return null;

  const accountId = accountRaw.replace(/^act_/, '');
  const timeRange = JSON.stringify({ since: dayKey, until: dayKey });
  const url = new URL(`https://graph.facebook.com/v21.0/act_${accountId}/insights`);
  url.searchParams.set('fields', 'impressions,clicks,spend,actions');
  url.searchParams.set('time_range', timeRange);
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta insights HTTP ${res.status}`);
  }

  const row = json.data?.[0];
  const spendUsd = Number.parseFloat(row?.spend ?? '0') || 0;

  return {
    platform: /** @type {AdPlatform} */ ('meta'),
    dayKey,
    impressions: Number.parseInt(row?.impressions ?? '0', 10) || 0,
    clicks: Number.parseInt(row?.clicks ?? '0', 10) || 0,
    spendCents: Math.round(spendUsd * 100),
    conversions: parseMetaConversions(row?.actions),
    rawJson: json,
  };
}

/**
 * @param {string} dayKey
 * @param {{ accessToken: string; advertiserId: string }} creds
 */
export async function fetchTikTokDailySnapshot(dayKey, creds) {
  const accessToken = creds.accessToken?.trim();
  const advertiserId = creds.advertiserId?.trim();
  if (!accessToken || !advertiserId) return null;

  const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/', {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      advertiser_id: advertiserId,
      service_type: 'AUCTION',
      report_type: 'BASIC',
      data_level: 'AUCTION_ADVERTISER',
      dimensions: ['stat_time_day'],
      metrics: ['spend', 'impressions', 'clicks', 'conversion'],
      start_date: dayKey,
      end_date: dayKey,
      page: 1,
      page_size: 1,
    }),
    cache: 'no-store',
  });

  const json = await res.json();
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message ?? `TikTok Ads API HTTP ${res.status}`);
  }

  const metrics = json.data?.list?.[0]?.metrics;
  const spendUsd = Number.parseFloat(metrics?.spend ?? '0') || 0;

  return {
    platform: /** @type {AdPlatform} */ ('tiktok'),
    dayKey,
    impressions: Number.parseInt(metrics?.impressions ?? '0', 10) || 0,
    clicks: Number.parseInt(metrics?.clicks ?? '0', 10) || 0,
    spendCents: Math.round(spendUsd * 100),
    conversions: Number.parseInt(metrics?.conversion ?? '0', 10) || 0,
    rawJson: json,
  };
}

/**
 * Summarize on-site UTM rows into per-platform attribution snapshots.
 * Does not invent ad spend — impressions stay 0; clicks ≈ attributed page views.
 *
 * @param {Array<{
 *   day_et: string;
 *   utm_source: string;
 *   utm_medium: string;
 *   utm_campaign: string;
 *   page_views: number | string;
 *   unique_visitors: number | string;
 * }>} rows
 */
export function attributionRowsToPlatformSnapshots(rows) {
  /** @type {Map<string, { platform: AdPlatform; dayKey: string; impressions: number; clicks: number; spendCents: number; conversions: number; rawJson: object }>} */
  const map = new Map();

  for (const row of rows) {
    const src = String(row.utm_source || '').toLowerCase();
    /** @type {AdPlatform | null} */
    let platform = null;
    if (src === 'fb' || src === 'ig' || src === 'facebook' || src === 'instagram' || src === 'meta') {
      platform = 'meta';
    } else if (src === 'tiktok' || src === 'tt') {
      platform = 'tiktok';
    } else if (src === 'google' || src === 'gclid') {
      platform = 'google';
    }
    if (!platform) continue;

    const dayKey = String(row.day_et);
    const key = `${platform}|${dayKey}`;
    const pageViews = Number(row.page_views) || 0;
    const uniqueVisitors = Number(row.unique_visitors) || 0;
    const prev = map.get(key) || {
      platform,
      dayKey,
      impressions: 0,
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      rawJson: { source: 'site_attribution', campaigns: [] },
    };
    prev.clicks += pageViews;
    /** @type {any[]} */
    const campaigns = prev.rawJson.campaigns;
    campaigns.push({
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      page_views: pageViews,
      unique_visitors: uniqueVisitors,
    });
    prev.rawJson = {
      source: 'site_attribution',
      note: 'On-site UTM attribution — not Meta/TikTok Ads API spend. clicks = attributed page views.',
      campaigns,
    };
    map.set(key, prev);
  }

  return [...map.values()];
}

/**
 * @param {{
 *   meta?: { accessToken?: string; adAccountId?: string };
 *   tiktok?: { accessToken?: string; advertiserId?: string };
 *   days?: number;
 *   dayKeys?: string[];
 * }} opts
 */
export async function pullLivePlatformSnapshots(opts = {}) {
  const dayKeys = opts.dayKeys?.length
    ? opts.dayKeys
    : easternDayWindow(opts.days ?? 7);

  /** @type {Array<{ platform: AdPlatform; dayKey: string; impressions: number; clicks: number; spendCents: number; conversions: number; rawJson: unknown; source: string }>} */
  const snapshots = [];
  /** @type {Partial<Record<AdPlatform, string>>} */
  const errors = {};
  /** @type {AdPlatform[]} */
  const synced = [];

  const metaCreds = {
    accessToken: opts.meta?.accessToken || '',
    adAccountId: opts.meta?.adAccountId || '',
  };
  const tiktokCreds = {
    accessToken: opts.tiktok?.accessToken || '',
    advertiserId: opts.tiktok?.advertiserId || '',
  };

  const metaConfigured = Boolean(metaCreds.accessToken && metaCreds.adAccountId);
  const tiktokConfigured = Boolean(tiktokCreds.accessToken && tiktokCreds.advertiserId);

  for (const dayKey of dayKeys) {
    if (metaConfigured) {
      try {
        const snap = await fetchMetaDailySnapshot(dayKey, metaCreds);
        if (snap) {
          snapshots.push({ ...snap, source: 'api' });
          if (!synced.includes('meta')) synced.push('meta');
        }
      } catch (e) {
        errors.meta = e instanceof Error ? e.message : 'Meta sync failed';
      }
    }

    if (tiktokConfigured) {
      try {
        const snap = await fetchTikTokDailySnapshot(dayKey, tiktokCreds);
        if (snap) {
          snapshots.push({ ...snap, source: 'api' });
          if (!synced.includes('tiktok')) synced.push('tiktok');
        }
      } catch (e) {
        errors.tiktok = e instanceof Error ? e.message : 'TikTok sync failed';
      }
    }
  }

  return {
    dayKeys,
    snapshots,
    synced,
    errors,
    missing: {
      meta: metaConfigured
        ? []
        : ['META_ADS_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'].filter((k) => {
            if (k === 'META_ADS_ACCESS_TOKEN') return !metaCreds.accessToken;
            return !metaCreds.adAccountId;
          }),
      tiktok: tiktokConfigured
        ? []
        : ['TIKTOK_ADS_ACCESS_TOKEN', 'TIKTOK_ADS_ADVERTISER_ID'].filter((k) => {
            if (k === 'TIKTOK_ADS_ACCESS_TOKEN') return !tiktokCreds.accessToken;
            return !tiktokCreds.advertiserId;
          }),
    },
  };
}
