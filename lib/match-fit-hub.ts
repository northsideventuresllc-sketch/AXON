/**
 * Match Fit venture hub — NI-Brain reads for AXON operator page (W10 v1).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NI_BRAIN_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://kxijunwgbrlfzvgkhklo.supabase.co';

const MF_ADMIN = 'https://match-fit.net/admin';

export const MF_ADMIN_LINKS = {
  contentCalendar: `${MF_ADMIN}/content-calendar`,
  contentPreview: `${MF_ADMIN}/content-calendar/preview`,
  adTracking: `${MF_ADMIN}/ad-tracking`,
  outreach: `${MF_ADMIN}/outreach`,
  dashboard: MF_ADMIN,
} as const;

function sb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

export type MfContentPost = {
  id: string;
  post_type: string;
  theme_name: string;
  status: string;
  caption: string | null;
  platforms: string[] | null;
  created_at: string;
};

export type MfHubSnapshot = {
  todayTheme: string;
  contentPending: number;
  contentApproved: number;
  outreachActive: number;
  posts: MfContentPost[];
};

export async function fetchMatchFitHub(): Promise<MfHubSnapshot> {
  const client = sb();
  const today = new Date().toISOString().split('T')[0];

  const { data: posts, error } = await client
    .from('content_machine_posts')
    .select('id,post_type,theme_name,status,caption,platforms,created_at')
    .eq('brand_slug', 'match-fit')
    .gte('created_at', `${today}T00:00:00`)
    .in('status', ['pending_approval', 'approved'])
    .order('post_type', { ascending: true });
  if (error) throw new Error(error.message);

  const { count: outreachActive } = await client
    .from('ni_brain_outreach')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'match_fit')
    .not('status', 'in', '(dead,dead_lead,converted,rejected)');

  const list = posts ?? [];
  const pending = list.filter((p) => p.status === 'pending_approval');
  const approved = list.filter((p) => p.status === 'approved');
  const theme = pending[0]?.theme_name || approved[0]?.theme_name || '—';

  return {
    todayTheme: theme,
    contentPending: pending.length,
    contentApproved: approved.length,
    outreachActive: outreachActive ?? 0,
    posts: list.slice(0, 8),
  };
}
