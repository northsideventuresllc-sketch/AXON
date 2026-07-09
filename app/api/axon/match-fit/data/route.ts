/**
 * Match Fit admin data — serves NI-Brain reads to the AXON admin portal tool.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { MF_SESSION_COOKIE, getMatchFitAccessCode, getMatchFitLegacyCredentials, isMatchFitSessionValid } from '@/lib/match-fit-session';

export const dynamic = 'force-dynamic';

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

const SESSION_COOKIE = MF_SESSION_COOKIE;

async function checkSession(): Promise<boolean> {
  const envCode = getMatchFitAccessCode();
  const { email: envEmail } = getMatchFitLegacyCredentials();
  if (!envCode && !envEmail) return false;
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

    const [todayPosts, outreachLeads, recentPosts] = await Promise.all([
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
    ]);

    const posts = (todayPosts ?? []) as PostRow[];
    const leads = (outreachLeads ?? []) as OutreachRow[];
    const recent = (recentPosts ?? []) as RecentRow[];

    const pending = posts.filter((p) => p.status === 'pending_approval');
    const approved = posts.filter((p) => p.status === 'approved');

    const adSummary = {
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
