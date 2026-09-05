/**
 * Match Fit → AXON posting-confirmation webhook — payload validation.
 * Shared between the route handler (app/api/axon/match-fit/posting-confirmation/route.ts)
 * and the plain-node test (tests/match-fit-posting-confirmation.test.mjs).
 */

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validate the Match Fit content-calendar posting-confirmation payload.
 * Returns { ok: true, data } on success, or { ok: false, error } on the first
 * problem found — the route maps this straight to a 400 response.
 */
export function validatePostingConfirmationPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { batchId, posts } = body;

  if (!isNonEmptyString(batchId)) {
    return { ok: false, error: '"batchId" is required and must be a non-empty string' };
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    return { ok: false, error: '"posts" is required and must be a non-empty array' };
  }

  const normalizedPosts = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (!post || typeof post !== 'object' || Array.isArray(post)) {
      return { ok: false, error: `posts[${i}] must be an object` };
    }
    const { platform, url, postedAt } = post;
    if (!isNonEmptyString(platform)) {
      return { ok: false, error: `posts[${i}].platform is required and must be a non-empty string` };
    }
    if (!isNonEmptyString(url)) {
      return { ok: false, error: `posts[${i}].url is required and must be a non-empty string` };
    }
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      return { ok: false, error: `posts[${i}].url must be a valid URL` };
    }
    if (!isNonEmptyString(postedAt) || !ISO_8601_RE.test(postedAt.trim())) {
      return { ok: false, error: `posts[${i}].postedAt must be an ISO-8601 string` };
    }
    if (Number.isNaN(new Date(postedAt).getTime())) {
      return { ok: false, error: `posts[${i}].postedAt must be a valid date` };
    }
    normalizedPosts.push({
      platform: platform.trim(),
      url: url.trim(),
      postedAt: postedAt.trim(),
    });
  }

  return {
    ok: true,
    data: { batchId: batchId.trim(), posts: normalizedPosts },
  };
}

/** Build the AxonNotification fields for a validated posting-confirmation payload. */
export function buildPostingConfirmationNotification({ batchId, posts }) {
  const platforms = [...new Set(posts.map((p) => p.platform))];
  const title =
    posts.length === 1
      ? `1 post went live on ${platforms[0]}`
      : `${posts.length} posts went live (${platforms.join(', ')})`;

  return {
    source: 'Match Fit',
    title,
    body: `Batch ${batchId} — ${posts.length} post${posts.length === 1 ? '' : 's'} confirmed live.`,
    urgent: false,
    href: posts[0]?.url,
    links: posts.map((p) => ({
      label: `${p.platform} · ${new Date(p.postedAt).toLocaleString('en-US', {
        timeZone: 'America/New_York',
      })}`,
      url: p.url,
    })),
  };
}
