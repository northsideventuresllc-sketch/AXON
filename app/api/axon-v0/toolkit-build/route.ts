import { NextResponse } from 'next/server';
import { requestToolkitBuild, type ToolkitBuildSpec } from '@/lib/axon-toolkit-build';
import { listAgents, listVentures } from '@/lib/axon-v0/store';

/**
 * AXON usability item #10 — the Toolkit's "Create custom widget" flow used to save a
 * spec to the browser and go nowhere (see the comment this closes in
 * components/axon-v0/widget-catalog.tsx and lib/axon-toolkit-build.mjs). This route
 * resolves the venture's Build Manager (role `build_manager`, present on every venture
 * — lib/axon-v0/types.ts DEFAULT_AGENTS) via the SAME store.ts readers every other
 * venture-scoped route uses, then hands the spec off through requestToolkitBuild(),
 * which is a thin FIRE/HOLD-gate check in front of the one real fireAgent() path. No
 * new dispatch mechanism, no new agent lookup implementation.
 *
 * Never 500s: an unresolvable venture, a missing Build Manager, a gate HOLD, or a
 * downstream failure are all reported as { ok: false, ... } with a plain reason, same
 * try/catch-safe fallback style as the rest of this slice.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      ventureId?: string;
      spec?: ToolkitBuildSpec;
    };

    const spec = body.spec;
    if (!spec || !String(spec.name || '').trim()) {
      return NextResponse.json({ ok: false, reason: 'No widget spec given.' });
    }

    const ventures = await listVentures().catch(() => []);
    if (ventures.length === 0) {
      return NextResponse.json({ ok: false, reason: 'No venture to build in yet.' });
    }
    const venture =
      ventures.find((v) => v.id === body.ventureId) ||
      ventures.find((v) => v.name.trim().toLowerCase() === 'axon') ||
      ventures[0];

    const agents = await listAgents(venture.id).catch(() => []);
    const buildManager = agents.find((a) => a.role === 'build_manager');
    if (!buildManager) {
      return NextResponse.json({ ok: false, reason: `${venture.name} has no Build Manager yet.` });
    }

    const result = await requestToolkitBuild({
      spec,
      toAgentId: buildManager.id,
      ventureId: venture.id,
      fromAgentId: 'toolkit-ui',
    });

    return NextResponse.json({ ...result, ventureName: venture.name, agentName: buildManager.name });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: err instanceof Error ? err.message : 'Toolkit build request failed.' });
  }
}
