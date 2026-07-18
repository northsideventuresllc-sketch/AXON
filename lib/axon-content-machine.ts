/**
 * NI Content Machine — dashboard data layer.
 *
 * Product-first NORTHSiDE Intelligence content: 3/2/2 mix, one post per platform
 * per day across LinkedIn, Instagram, Facebook and Threads (Reddit is separate).
 * Reads real `content_machine_posts` from NI-Brain when the service key is present
 * and the rows are readable; otherwise serves representative fixtures so the UI is
 * fully interactive Monday morning.
 */
import { createSupabaseClient } from './supabase.mjs';

export const CONTENT_PLATFORMS = ['linkedin', 'instagram', 'facebook', 'threads'] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook',
  threads: 'Threads',
};

/** NI 3/2/2 product-first content mix. */
export const CONTENT_MIX = [
  { key: 'product', label: 'Product', count: 3, hint: 'Product-first — what NI ships and why it wins.' },
  { key: 'authority', label: 'Authority', count: 2, hint: 'Point of view, proof, credibility.' },
  { key: 'community', label: 'Community', count: 2, hint: 'Engagement, replies, culture.' },
] as const;

export type ContentPostStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected';

export interface ContentPost {
  id: string;
  platform: ContentPlatform | string;
  pillar: string;
  postType: string;
  caption: string;
  status: ContentPostStatus | string;
  dayIndex: number | null;
  themeName: string | null;
  imageUrl: string | null;
  createdAt: string | null;
  source: 'ni-brain' | 'fixture';
}

function getSupabaseKey(): string {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

const FIXTURE_POSTS: ContentPost[] = [
  {
    id: 'fx-li-1',
    platform: 'linkedin',
    pillar: 'product',
    postType: 'Post',
    caption:
      'Most teams don\u2019t have a data problem — they have a decision problem. Here\u2019s how NORTHSiDE Intelligence turns scattered signal into one operator view. \u2192',
    status: 'pending_approval',
    dayIndex: 0,
    themeName: 'Product spotlight',
    imageUrl: null,
    createdAt: new Date().toISOString(),
    source: 'fixture',
  },
  {
    id: 'fx-ig-1',
    platform: 'instagram',
    pillar: 'community',
    postType: 'Reel',
    caption: 'One dashboard. Every venture. Zero tab-switching. #NORTHSiDE #Intelligence',
    status: 'draft',
    dayIndex: 0,
    themeName: 'Behind the build',
    imageUrl: null,
    createdAt: new Date().toISOString(),
    source: 'fixture',
  },
  {
    id: 'fx-fb-1',
    platform: 'facebook',
    pillar: 'authority',
    postType: 'Post',
    caption:
      'The AI hype cycle is loud. Outcomes are quiet. This week we shipped a system that pays for itself in reclaimed hours.',
    status: 'approved',
    dayIndex: 0,
    themeName: 'Point of view',
    imageUrl: null,
    createdAt: new Date().toISOString(),
    source: 'fixture',
  },
  {
    id: 'fx-th-1',
    platform: 'threads',
    pillar: 'product',
    postType: 'Post',
    caption: 'What would you automate first if your ops ran themselves overnight?',
    status: 'pending_approval',
    dayIndex: 0,
    themeName: 'Engagement',
    imageUrl: null,
    createdAt: new Date().toISOString(),
    source: 'fixture',
  },
];

function mapRow(row: Record<string, unknown>): ContentPost {
  const meta = (row.meta as Record<string, unknown> | null) || {};
  const platform =
    (row.platform as string) ||
    (row.channel as string) ||
    (meta.platform as string) ||
    'linkedin';
  return {
    id: String(row.id),
    platform: String(platform).toLowerCase(),
    pillar: String((row.pillar as string) || (meta.pillar as string) || (row.theme_name as string) || 'product'),
    postType: String((row.post_type as string) || 'Post'),
    caption: String((row.caption as string) || ''),
    status: String((row.status as string) || 'draft'),
    dayIndex: row.day_index != null ? Number(row.day_index) : null,
    themeName: (row.theme_name as string) ?? null,
    imageUrl: (row.image_url as string) ?? null,
    createdAt: (row.created_at as string) ?? null,
    source: 'ni-brain',
  };
}

/** Fetch content posts — real NI-Brain rows when readable, else fixtures. */
export async function fetchContentPosts(): Promise<{ posts: ContentPost[]; live: boolean }> {
  const key = getSupabaseKey();
  if (!key) return { posts: FIXTURE_POSTS, live: false };
  try {
    const { sbSelect } = createSupabaseClient(key);
    const rows = (await sbSelect(
      'content_machine_posts',
      'brand_slug=neq.match-fit&status=neq.purged&select=*&order=created_at.desc&limit=60',
    )) as Array<Record<string, unknown>>;
    if (!rows || rows.length === 0) return { posts: FIXTURE_POSTS, live: false };
    return { posts: rows.map(mapRow), live: true };
  } catch {
    return { posts: FIXTURE_POSTS, live: false };
  }
}

/** Non-mutating actions allowed while HOLD. */
export const HOLD_SAFE_ACTIONS = new Set(['approve', 'edit', 'adjust', 'optimize', 'reject']);
/** Actions that actually push content out — blocked while HOLD. */
export const FIRE_ONLY_ACTIONS = new Set(['publish', 'schedule']);

export interface ContentActionResult {
  ok: boolean;
  action: string;
  postId: string;
  status?: ContentPostStatus;
  message: string;
}

/**
 * Apply a content action. Mutating writes only happen against real rows; on
 * fixtures the action is simulated. Publish/schedule are gated by the caller.
 */
export async function applyContentAction(
  action: string,
  postId: string,
  payload: { caption?: string } = {},
): Promise<ContentActionResult> {
  const key = getSupabaseKey();
  const isFixture = postId.startsWith('fx-') || !key;

  const nextStatus: Record<string, ContentPostStatus> = {
    approve: 'approved',
    reject: 'rejected',
    edit: 'approved',
    adjust: 'draft',
    optimize: 'draft',
    publish: 'published',
    schedule: 'scheduled',
  };

  if (isFixture) {
    return {
      ok: true,
      action,
      postId,
      status: nextStatus[action],
      message: `Simulated "${action}" on ${postId} (fixture — no live content_machine_posts write).`,
    };
  }

  const { sbPatch } = createSupabaseClient(key);
  const fields: Record<string, unknown> = { status: nextStatus[action], updated_at: new Date().toISOString() };
  if (action === 'edit' && payload.caption) fields.caption = payload.caption.trim();
  await sbPatch('content_machine_posts', `id=eq.${postId}`, fields);
  return {
    ok: true,
    action,
    postId,
    status: nextStatus[action],
    message: `Applied "${action}" to post ${postId}.`,
  };
}
