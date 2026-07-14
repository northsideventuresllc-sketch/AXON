/**
 * Match Fit admin data — serves NI-Brain reads to the AXON admin portal tool.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  MF_SESSION_COOKIE,
  getMatchFitLegacyCredentials,
  isMatchFitSessionValid,
  resolveMatchFitAccessCode,
} from '@/lib/match-fit-session';

export const dynamic = 'force-dynamic';

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

const SESSION_COOKIE = MF_SESSION_COOKIE;

async function checkSession(): Promise<boolean> {
  const accessCode = await resolveMatchFitAccessCode();
  const { email: envEmail } = getMatchFitLegacyCredentials();
  if (!accessCode && !envEmail) return false;
  const cookieStore = await cookies();
  const stored = cookieStore.get(SESSION_COOKIE)?.value ?? '';
  return isMatchFitSessionValid(stored);
}

function getClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  async function sbSelect(table: string, filter = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      headers: { ...headers, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`Supabase select ${table}: HTTP ${r.status}`);
    return r.json();
  }
  return { sbSelect };
}

type PostRow = {
  id: string;
  post_type: string;
  theme_name: string;
  status: string;
  caption: string | null;
  platforms: string[] | null;
  created_at: string;
  scheduled_for: string | null;
};

type OutreachRow = {
  id: string;
  full_name: string | null;
  instagram_handle: string | null;
  status: string;
  created_at: string;
  source: string;
};

type RecentRow = {
  id: string;
  post_type: string;
  status: string;
  platforms: string[] | null;
  created_at: string;
};

type AdSnapshotRow = {
  platform: string;
  day_key: string;
  impressions: number;
  clicks: number;
  spend_cents: number;
  conversions: number;
  source: string;
  updated_at: string;
};

function emptyAdTotals() {
  return { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
}

export async function GET() {
  const authed = await checkSession();
  if (!authed) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { sbSelect } = getClient();
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const loadAdSnapshots = async (): Promise<AdSnapshotRow[]> => {
      try {
        return (await sbSelect(
          'mf_ad_platform_daily_snapshots',
          `day_key=gte.${thirtyDaysAgo}&select=platform,day_key,impressions,clicks,spend_cents,conversions,source,updated_at&order=day_key.desc&limit=200`
        )) as AdSnapshotRow[];
      } catch {
        return [];
      }
    };

    const [todayPosts, outreachLeads, recentPosts, adSnapshotsRaw] = await Promise.all([
      sbSelect(
        'content_machine_posts',
        `brand_slug=eq.match-fit&created_at=gte.${today}T00:00:00&select=id,post_type,theme_name,status,caption,platforms,created_at,scheduled_for&order=post_type.asc`
      ) as Promise<PostRow[]>,
      sbSelect(
        'ni_brain_outreach',
        `source=eq.match_fit&status=not.in.(dead,dead_lead,converted,rejected,purged)&select=id,full_name,instagram_handle,status,created_at,source&order=created_at.desc&limit=20`
      ) as Promise<OutreachRow[]>,
      sbSelect(
        'content_machine_posts',
        `brand_slug=eq.match-fit&created_at=gte.${thirtyDaysAgo}T00:00:00&select=id,post_type,status,platforms,created_at&order=created_at.desc&limit=200`
      ) as Promise<RecentRow[]>,
      loadAdSnapshots(),
    ]);

    const posts = (todayPosts ?? []) as PostRow[];
    const leads = (outreachLeads ?? []) as OutreachRow[];
    const recent = (recentPosts ?? []) as RecentRow[];
    const adSnapshots = (adSnapshotsRaw ?? []) as AdSnapshotRow[];

    const pending = posts.filter((p) => p.status === 'pending_approval');
    const approved = posts.filter((p) => p.status === 'approved');

    const apiRows = adSnapshots.filter((r) => r.source === 'api');
    const attrRows = adSnapshots.filter((r) => r.source === 'site_attribution');
    const metricRows = apiRows.length ? apiRows : attrRows;

    const sumPlatform = (platform: string) =>
      metricRows
        .filter((r) => r.platform === platform)
        .reduce(
          (acc, r) => ({
            impressions: acc.impressions + (r.impressions || 0),
            clicks: acc.clicks + (r.clicks || 0),
            spendCents: acc.spendCents + (r.spend_cents || 0),
            conversions: acc.conversions + (r.conversions || 0),
          }),
          emptyAdTotals()
        );

    const adSummary = {
      // Legacy content-calendar counts (still useful for posts tab context)
      totalLast30Days: recent.length,
      published: recent.filter((p) => p.status === 'approved' || p.status === 'published').length,
      pending: recent.filter((p) => p.status === 'pending_approval').length,
      byPlatform: recent.reduce(
        (acc: Record<string, number>, p) => {
          for (const pl of p.platforms ?? []) {
            acc[pl] = (acc[pl] ?? 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      ),
      // Live ad tracker (NI-Brain mf_ad_platform_daily_snapshots from AX-AD sync)
      tracker: {
        mode: apiRows.length ? ('api' as const) : attrRows.length ? ('site_attribution' as const) : ('empty' as const),
        daysCovered: new Set(metricRows.map((r) => r.day_key)).size,
        totals: {
          meta: sumPlatform('meta'),
          tiktok: sumPlatform('tiktok'),
          google: sumPlatform('google'),
        },
        daily: metricRows.slice(0, 21).map((r) => ({
          platform: r.platform,
          dayKey: r.day_key,
          impressions: r.impressions,
          clicks: r.clicks,
          spendCents: r.spend_cents,
          conversions: r.conversions,
          source: r.source,
          syncedAt: r.updated_at,
        })),
      },
    };

    return NextResponse.json({
      ok: true,
      data: {
        todayTheme: pending[0]?.theme_name || approved[0]?.theme_name || '—',
        contentPending: pending.length,
        contentApproved: approved.length,
        outreachActive: leads.length,
        todayPosts: posts,
        outreachLeads: leads,
        adSummary,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'data fetch failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
