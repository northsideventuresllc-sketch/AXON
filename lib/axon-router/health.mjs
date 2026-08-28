// lib/axon-router/health.mjs
//
// NI-Brain reads/writes for the AXON router, per axon-router-spec.md §3.
//
// Tables: router_routes, router_models, router_health.
//
// The repo's existing `lib/supabase.mjs` helper (`createSupabaseClient`) only
// covers plain select/insert/patch/delete — it has no upsert-with-merge
// support, which the §3 health writes need (ON CONFLICT ... DO UPDATE SET
// only the columns present in the payload). Reads reuse `sbSelect`; writes
// use a small local upsert helper built the same way `sbUpsertSecret` is
// built in supabase.mjs (direct fetch with `Prefer: resolution=merge-duplicates`).

import { createSupabaseClient } from '../supabase.mjs';
import { SUPABASE_URL } from '../constants.mjs';

// §3: backoff schedule 30s -> 2m -> 10m -> 30m, indexed by
// least(failure_count + 1, 4), 1-based in SQL -> 0-based here.
const BACKOFF_SECONDS = [30, 120, 600, 1800];

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function requireKey() {
  const key = getSupabaseKey();
  if (!key) {
    throw new Error('SUPABASE_SERVICE_KEY not configured — cannot reach NI-Brain');
  }
  return key;
}

/**
 * Upsert a row into `table`, matching on `conflictCols` (comma-joined column
 * list), touching only the columns present in `row` — mirrors Postgres
 * `ON CONFLICT (...) DO UPDATE SET col = EXCLUDED.col` for exactly the
 * supplied columns, leaving anything else (e.g. failure_count on markDead)
 * untouched on an existing row, and falling back to table defaults on insert.
 */
async function sbUpsert(key, table, conflictCols, row) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCols}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`Supabase upsert ${table}: HTTP ${r.status} ${text}`);
  }
  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data[0] : data;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * §3 candidate selection query, executed as a REST read + JS join because
 * the shared Supabase helper has no arbitrary-SQL path.
 *
 * Returns (route, model) pairs at tier_rank >= tierRank, route+model
 * enabled, and not dead / not currently cooling off — ordered by
 * tier_rank desc, priority asc (highest tier, most-preferred first).
 *
 * @param {number} tierRank
 * @param {string} [model] - optional exact-model filter (used by pinned-mode resolution too)
 * @returns {Promise<Array<{ route: string, model: string, tierRank: number, routeId: string }>>}
 */
export async function selectCandidates(tierRank, model) {
  const key = requireKey();
  const { sbSelect } = createSupabaseClient(key);

  let modelsFilter =
    `select=id,model,tier_rank,priority,route_id,router_routes(id,name,enabled)` +
    `&enabled=eq.true&tier_rank=gte.${tierRank}&order=tier_rank.desc,priority.asc`;
  if (model) {
    modelsFilter += `&model=eq.${encodeURIComponent(model)}`;
  }

  const modelRows = await sbSelect('router_models', modelsFilter);
  const liveRows = (modelRows || []).filter(
    (m) => m.router_routes && m.router_routes.enabled === true,
  );
  if (liveRows.length === 0) return [];

  const routeIds = [...new Set(liveRows.map((m) => m.route_id))];
  const healthRows = await sbSelect(
    'router_health',
    `route_id=in.(${routeIds.join(',')})&select=route_id,model,status,retry_after`,
  );

  const healthByKey = new Map();
  for (const h of healthRows || []) {
    healthByKey.set(`${h.route_id}|${h.model}`, h);
  }

  const now = Date.now();
  const isBlocked = (h) => {
    if (!h) return false; // no row = healthy
    if (h.status === 'dead') return true;
    if (h.status === 'rate_limited' && h.retry_after) {
      return new Date(h.retry_after).getTime() > now;
    }
    return false;
  };

  const candidates = liveRows
    .filter((m) => {
      const routeWide = healthByKey.get(`${m.route_id}|`);
      const perModel = healthByKey.get(`${m.route_id}|${m.model}`);
      return !isBlocked(routeWide) && !isBlocked(perModel);
    })
    .map((m) => ({
      route: m.router_routes.name,
      model: m.model,
      tierRank: m.tier_rank,
      routeId: m.route_id,
    }));

  // Re-sort defensively — REST order should already match, but the JS
  // filter/join must not be allowed to silently reorder candidates.
  candidates.sort((a, b) => b.tierRank - a.tierRank);
  return candidates;
}

/**
 * Resolve a pinned (route, model) — either or both may be omitted-but-not-both.
 * Used by walker.mjs's pinned mode (§5). Looks up the pair's tier and current
 * health status independent of whether it would currently pass candidate
 * selection (a pinned call needs to know *why* a pair is unusable, not just
 * that it is).
 *
 * @param {string} [routeName]
 * @param {string} [model]
 * @returns {Promise<null | {
 *   route: string, model: string, routeId: string, tierRank: number,
 *   status: 'healthy'|'rate_limited'|'dead', reason?: string, retryAfter?: string
 * }>}
 */
export async function resolvePinnedPair(routeName, model) {
  const key = requireKey();
  const { sbSelect } = createSupabaseClient(key);

  let filter =
    'select=id,model,tier_rank,priority,route_id,router_routes(id,name,enabled)' +
    '&enabled=eq.true&order=tier_rank.desc,priority.asc';
  if (model) filter += `&model=eq.${encodeURIComponent(model)}`;
  if (routeName) filter += `&router_routes.name=eq.${encodeURIComponent(routeName)}`;

  const rows = await sbSelect('router_models', filter);
  const match = (rows || []).find(
    (m) =>
      m.router_routes &&
      m.router_routes.enabled === true &&
      (!routeName || m.router_routes.name === routeName),
  );
  if (!match) return null;

  const healthRows = await sbSelect(
    'router_health',
    `route_id=eq.${match.route_id}&select=route_id,model,status,reason,retry_after`,
  );
  const routeWide = (healthRows || []).find((h) => h.model === '');
  const perModel = (healthRows || []).find((h) => h.model === match.model);

  let status = 'healthy';
  let reason;
  let retryAfter;
  for (const h of [routeWide, perModel]) {
    if (!h) continue;
    if (h.status === 'dead') {
      status = 'dead';
      reason = h.reason;
      break;
    }
    if (h.status === 'rate_limited' && h.retry_after && new Date(h.retry_after).getTime() > Date.now()) {
      status = 'rate_limited';
      reason = h.reason;
      retryAfter = h.retry_after;
    }
  }

  return {
    route: match.router_routes.name,
    model: match.model,
    routeId: match.route_id,
    tierRank: match.tier_rank,
    status,
    reason,
    retryAfter,
  };
}

/**
 * Mark (routeId, model) rate-limited — §3 backoff upsert.
 * `model` is '' for a route-wide (credential) failure, else the exact model.
 */
export async function markRateLimited(routeId, model, reason) {
  const key = requireKey();
  const { sbSelect } = createSupabaseClient(key);

  const existing = await sbSelect(
    'router_health',
    `route_id=eq.${routeId}&model=eq.${encodeURIComponent(model)}&select=failure_count&limit=1`,
  );
  const priorFailureCount = existing?.[0]?.failure_count ?? 0;
  const newFailureCount = priorFailureCount + 1;
  const backoffSeconds = BACKOFF_SECONDS[Math.min(newFailureCount, 4) - 1];
  const ts = nowIso();
  const retryAfter = new Date(Date.now() + backoffSeconds * 1000).toISOString();

  return sbUpsert(key, 'router_health', 'route_id,model', {
    route_id: routeId,
    model,
    status: 'rate_limited',
    reason,
    failure_count: newFailureCount,
    backoff_seconds: backoffSeconds,
    retry_after: retryAfter,
    last_failure_at: ts,
    updated_at: ts,
  });
}

/**
 * Mark (routeId, model) dead — terminal, stays until a human clears it.
 * `model` is '' for a route-wide (credential) failure, else the exact model.
 */
export async function markDead(routeId, model, reason) {
  const key = requireKey();
  const ts = nowIso();
  return sbUpsert(key, 'router_health', 'route_id,model', {
    route_id: routeId,
    model,
    status: 'dead',
    reason,
    retry_after: null,
    last_failure_at: ts,
    updated_at: ts,
  });
}

/** Clear (routeId, model) back to healthy after a successful call. */
export async function markSuccess(routeId, model) {
  const key = requireKey();
  const ts = nowIso();
  return sbUpsert(key, 'router_health', 'route_id,model', {
    route_id: routeId,
    model,
    status: 'healthy',
    failure_count: 0,
    backoff_seconds: 0,
    retry_after: null,
    last_success_at: ts,
    updated_at: ts,
  });
}
