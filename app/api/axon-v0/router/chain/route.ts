import { NextResponse } from 'next/server';
import { listCandidateLanes, scoreLanes } from '@/lib/axon-router';
import { getAccount, supabaseKey } from '@/lib/axon-v0/store';

/**
 * The account's REAL routing chain, as auto mode would rank it.
 *
 * Replaces the hardcoded TIER_CHAIN string array that used to be baked into the Settings
 * page and had drifted out of sync with the live lanes. Pass ?capability= to see how the
 * order changes per kind of work — that is the whole point of auto mode being explainable.
 */
export async function GET(req: Request) {
  try {
    const capability = new URL(req.url).searchParams.get('capability') || 'cheap_chat';
    const account = await getAccount();
    const lanes = await listCandidateLanes(supabaseKey(), { accountId: account?.id ?? null });
    const ranked = scoreLanes(lanes, { capabilityClass: capability });

    return NextResponse.json({
      capability,
      chain: ranked.map((r, i) => ({
        position: i + 1,
        laneId: r.lane.laneId,
        route: r.lane.route.name,
        model: r.lane.model,
        connectorKind: r.lane.connectorKind,
        costTier: r.lane.costTier,
        free: r.lane.costTier === 0,
        isSafetyNet: r.lane.isSafetyNet,
        requiresMini: !!r.lane.route.requires_mini,
        health: r.lane.health?.status || 'unknown',
        score: Number(r.score.toFixed(4)),
        reasons: r.reasons,
      })),
      excluded: lanes.length - ranked.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load the routing chain' },
      { status: 500 },
    );
  }
}
