/**
 * AXON shared secrets accessor — the ONE place that reads AXON_DASHBOARD_SECRET and the
 * Supabase service key from env.
 *
 * AX-DASHBOARD-SECRET-OWN-0906: the dashboard secret must be its own secret. It must never
 * be derived from (or fall back to) a slice of the Supabase service key — that pattern
 * silently widened the blast radius of a service-key leak into a dashboard-login bypass,
 * and meant the dashboard "worked" even when nobody had actually set
 * AXON_DASHBOARD_SECRET. Every caller in this repo that needs either secret must go
 * through this module instead of reading `process.env` ad hoc.
 *
 * Plain .mjs on purpose (same reasoning as lib/axon-fire-gate-core.mjs and
 * lib/axon-router-core.mjs): importable both from Next.js/TS (`@/lib/axon-secrets.mjs`)
 * and from raw `node` scripts / GitHub Actions with no TypeScript loader.
 *
 * REQUIRED IN VERCEL: AXON_DASHBOARD_SECRET must be set on the Vercel project — production
 * and any preview deploy that serves the dashboard. It is the ONE source of the session
 * cookie's value (see app/api/auth/login/route.ts and middleware.ts) — a live NI-Brain
 * `AXON_DASHBOARD_SECRET` row (lib/auth.ts's readBrainSecret) is still accepted as a login
 * *credential* so JB can rotate the code without a redeploy, but it is never written into
 * the session cookie. If this env var is unset, login refuses with a 503 instead of writing
 * a broken session, and middleware.ts refuses every request the same way. Confirmed already
 * set on this project's production and preview environments — this requirement is not new
 * exposure, it just stops a missing value from failing silently.
 */

/**
 * The Supabase service-role key AXON uses for server-side NI-Brain access.
 * Throws when neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set.
 * @returns {string}
 */
export function getSupabaseServiceKey() {
  const key = tryGetSupabaseServiceKey();
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not configured.',
    );
  }
  return key;
}

/**
 * Non-throwing variant — returns null instead of throwing when unset, for callers that
 * already fail safe on a missing key (e.g. the FIRE gate defaulting to HOLD).
 * @returns {string|null}
 */
export function tryGetSupabaseServiceKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * The AXON dashboard's own login/session secret. Never derived from the Supabase service
 * key — set AXON_DASHBOARD_SECRET explicitly or the dashboard must refuse to boot.
 * Throws when unset.
 * @returns {string}
 */
export function getDashboardSecret() {
  const secret = tryGetDashboardSecret();
  if (!secret) {
    throw new Error('AXON_DASHBOARD_SECRET is not configured.');
  }
  return secret;
}

/**
 * Non-throwing variant — returns null instead of throwing when unset, for callers (like
 * the edge middleware) that need to branch on "not configured" instead of catching.
 * @returns {string|null}
 */
export function tryGetDashboardSecret() {
  return process.env.AXON_DASHBOARD_SECRET || null;
}
