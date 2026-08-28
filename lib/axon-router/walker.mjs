// lib/axon-router/walker.mjs
//
// The AXON router's candidate-selection + fallback loop, per
// axon-router-spec.md §5 (and the tier-floor safety property in §6).

import { callAdapter } from './adapters/index.mjs';
import { classifyOutcome } from './classify.mjs';
import {
  selectCandidates,
  resolvePinnedPair,
  markRateLimited,
  markDead,
  markSuccess,
} from './health.mjs';

// §0 — tiers are ranked integers, comparable in SQL and here.
export const TIER_RANK = { frontier: 4, capable: 3, free: 2, local: 1 };
const TIER_NAME_BY_RANK = { 4: 'frontier', 3: 'capable', 2: 'free', 1: 'local' };

// §3: "Which key does a failure write to?" — 401/402/403 only.
function isCredentialReason(reason) {
  return /^40[123]_/.test(reason || '');
}

/**
 * Run selection at `tierRank` and walk the resulting candidates in order,
 * calling the adapter, classifying, and writing health for every failure
 * before advancing. Returns a success response object, or null if the
 * whole candidate list was exhausted without a success.
 *
 * Shared by the primary attempt and §5 step 7 (last resort) — the caller
 * decides what "exhausted" means at each stage.
 */
async function runSelectionLoop({ tierRank, requiredTier, payload, attempted }) {
  const candidates = await selectCandidates(tierRank);

  for (const candidate of candidates) {
    const startedAt = Date.now();
    const adapterResult = await callAdapter(candidate.route, candidate.model, payload);
    const latencyMs =
      typeof adapterResult?.latencyMs === 'number' ? adapterResult.latencyMs : Date.now() - startedAt;
    const classification = classifyOutcome(adapterResult);

    attempted.push({
      route: candidate.route,
      model: candidate.model,
      tier: TIER_NAME_BY_RANK[candidate.tierRank],
      classification: classification.class,
      reason: classification.reason,
      latencyMs,
    });

    if (classification.class === 'SUCCESS') {
      await markSuccess(candidate.routeId, candidate.model);
      return {
        ok: true,
        status: 'success',
        route: candidate.route,
        model: candidate.model,
        text: adapterResult.text,
        usage: adapterResult.usage ?? null,
        latencyMs,
        servedTier: TIER_NAME_BY_RANK[candidate.tierRank],
        requestedTier: requiredTier,
        degraded: false, // caller overrides to true when this came from step 7
      };
    }

    const healthModel = isCredentialReason(classification.reason) ? '' : candidate.model;
    if (classification.class === 'TERMINAL') {
      await markDead(candidate.routeId, healthModel, classification.reason);
    } else {
      await markRateLimited(candidate.routeId, healthModel, classification.reason);
    }
  }

  return null;
}

/** Auto mode — "choose like Cursor" (§5). */
async function walkAuto({ requiredTier, requiredTierRank, tierWasExplicit, payload }) {
  const attempted = [];

  const primary = await runSelectionLoop({
    tierRank: requiredTierRank,
    requiredTier,
    payload,
    attempted,
  });
  if (primary) return primary;

  // Step 6: exhausted at the required tier.
  if (tierWasExplicit) {
    // §6: an explicit tier is never silently downgraded — clean error, not a lower-tier answer.
    return {
      ok: false,
      status: 'tier_floor_failure',
      requiredTier,
      requestedTier: requiredTier,
      servedTier: null,
      degraded: false,
      attemptedPairs: attempted,
      reason: 'no_healthy_candidate_at_or_above_required_tier',
    };
  }

  // Step 7 — last resort, default-tier calls only. Re-run at rank 1 (local);
  // the higher-tier pairs already got health-written above, so this query's
  // own filters exclude them — only free/local survive.
  const lastResort = await runSelectionLoop({
    tierRank: TIER_RANK.local,
    requiredTier,
    payload,
    attempted,
  });
  if (lastResort) {
    return { ...lastResort, degraded: true, degradationPath: attempted.slice() };
  }

  return {
    ok: false,
    status: 'all_routes_exhausted',
    requiredTier,
    requestedTier: requiredTier,
    servedTier: null,
    degraded: true,
    degradationPath: attempted.slice(),
    reason: 'no_healthy_candidate_at_any_tier',
  };
}

/** Pinned mode — "stick with one" (§5). Never falls back to another route. */
async function walkPinned({
  requiredTier,
  requiredTierRank,
  tierWasExplicit,
  payload,
  pinnedRoute,
  pinnedModel,
  allowDegraded,
}) {
  const pair = await resolvePinnedPair(pinnedRoute, pinnedModel);
  if (!pair) {
    return {
      ok: false,
      status: 'pinned_unavailable',
      route: pinnedRoute ?? null,
      model: pinnedModel ?? null,
      reason: 'pair_not_configured',
      requestedTier: requiredTier,
      servedTier: null,
      degraded: false,
    };
  }

  const pinnedTierName = TIER_NAME_BY_RANK[pair.tierRank];
  const isBelowFloor = pair.tierRank < requiredTierRank;

  // Conflicting pin: explicit requiredTier above the pinned model's tier -> refused,
  // unless allowDegraded. Bare pin (tierWasExplicit === false) is always permitted.
  if (tierWasExplicit && isBelowFloor && !allowDegraded) {
    return {
      ok: false,
      status: 'pinned_below_floor',
      requiredTier,
      pinnedTier: pinnedTierName,
      route: pair.route,
      model: pair.model,
      requestedTier: requiredTier,
      servedTier: null,
      degraded: false,
    };
  }

  const degradationPath = isBelowFloor
    ? [{ route: pair.route, model: pair.model, tier: pinnedTierName, reason: 'pinned_below_requested_tier' }]
    : undefined;

  if (pair.status === 'dead' || pair.status === 'rate_limited') {
    return {
      ok: false,
      status: 'pinned_unavailable',
      route: pair.route,
      model: pair.model,
      reason: pair.reason || pair.status,
      requestedTier: requiredTier,
      servedTier: pinnedTierName,
      degraded: isBelowFloor,
      ...(degradationPath ? { degradationPath } : {}),
    };
  }

  const startedAt = Date.now();
  const adapterResult = await callAdapter(pair.route, pair.model, payload);
  const latencyMs =
    typeof adapterResult?.latencyMs === 'number' ? adapterResult.latencyMs : Date.now() - startedAt;
  const classification = classifyOutcome(adapterResult);

  const base = {
    route: pair.route,
    model: pair.model,
    requestedTier: requiredTier,
    servedTier: pinnedTierName,
    degraded: isBelowFloor,
    ...(degradationPath ? { degradationPath } : {}),
  };

  if (classification.class === 'SUCCESS') {
    await markSuccess(pair.routeId, pair.model);
    return {
      ok: true,
      status: 'success',
      ...base,
      text: adapterResult.text,
      usage: adapterResult.usage ?? null,
      latencyMs,
    };
  }

  // No fallback to another route, ever — return this failure as-is.
  const healthModel = isCredentialReason(classification.reason) ? '' : pair.model;
  if (classification.class === 'TERMINAL') {
    await markDead(pair.routeId, healthModel, classification.reason);
  } else {
    await markRateLimited(pair.routeId, healthModel, classification.reason);
  }

  return {
    ok: false,
    status: 'pinned_call_failed',
    ...base,
    classification: classification.class,
    reason: classification.reason,
    latencyMs,
  };
}

/**
 * walk({ requiredTier?, payload, pinnedRoute?, pinnedModel?, allowDegraded? })
 *
 * Public entry point for the AXON router (§5). `requiredTier` is optional
 * and resolves to 'capable' when omitted — captured as `tierWasExplicit`
 * BEFORE the default is substituted, and threaded through every decision
 * point untouched. This is load-bearing: re-deriving it from the resolved
 * value would make an explicit `requiredTier: 'capable'` indistinguishable
 * from a defaulted one, breaking the §6 tier-floor guarantee.
 */
export async function walk({ requiredTier, payload, pinnedRoute, pinnedModel, allowDegraded } = {}) {
  const tierWasExplicit = requiredTier !== undefined; // MUST come first
  requiredTier ??= 'capable';

  const requiredTierRank = TIER_RANK[requiredTier];
  if (!requiredTierRank) {
    throw new Error(`walk(): invalid requiredTier "${requiredTier}"`);
  }

  const isPinned = pinnedRoute !== undefined || pinnedModel !== undefined;
  if (isPinned) {
    return walkPinned({
      requiredTier,
      requiredTierRank,
      tierWasExplicit,
      payload,
      pinnedRoute,
      pinnedModel,
      allowDegraded,
    });
  }

  // allowDegraded has no effect in auto mode (§6) — deliberately not passed through.
  return walkAuto({ requiredTier, requiredTierRank, tierWasExplicit, payload });
}

export default walk;
