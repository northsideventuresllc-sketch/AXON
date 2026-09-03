import { NextResponse } from 'next/server';
import { getAgentRoutine } from '@/lib/axon-v0/agent-routines';
import { fireRosterAgent } from '@/lib/axon-roster-fire.mjs';
import { assertFireAllowed, FireHoldError } from '@/lib/axon-fire-gate';

/**
 * AXON v0 roster Fire — Phase 2 lane A4 (agentic-os-phase2-harness-usage.md, Phase A4).
 * POST { agent_name: string, note?: string } -> { fired, how, ref } | { fired: false, reason }
 *
 * Loads the live `nvg_agent_routines` row, applies the SAME FIRE/HOLD gate every other
 * mutation route in this repo uses (assertFireAllowed — 'dispatch.fire', the existing
 * "Repo Manager dispatch / Hermes dispatch fires" gate id; firing any roster agent is a
 * dispatch-class action, not a new gate id), then hands off to fireRosterAgent (plain
 * .mjs, see lib/axon-roster-fire.mjs) for the actual wake-type dispatch + authority check
 * + agent_bus/agent_task_log trace rows. Never bypasses the gate to make a fire "work."
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { agent_name?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ fired: false, reason: 'invalid JSON body' }, { status: 400 });
  }

  const agentName = typeof body.agent_name === 'string' ? body.agent_name.trim() : '';
  const note = typeof body.note === 'string' ? body.note : undefined;
  if (!agentName) {
    return NextResponse.json({ fired: false, reason: 'agent_name is required' }, { status: 400 });
  }

  try {
    await assertFireAllowed('dispatch.fire');
  } catch (err) {
    if (err instanceof FireHoldError) {
      return NextResponse.json({ fired: false, reason: err.message }, { status: 423 });
    }
    throw err;
  }

  const row = await getAgentRoutine(agentName);
  if (!row) {
    return NextResponse.json(
      { fired: false, reason: `"${agentName}" isn't in the roster (nvg_agent_routines)` },
      { status: 404 },
    );
  }

  try {
    const result = await fireRosterAgent(row, note);
    if (!result.ok) {
      return NextResponse.json({ fired: false, reason: result.reason }, { status: result.status ?? 422 });
    }
    return NextResponse.json({ fired: true, how: result.how, ref: result.ref });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Fire failed';
    console.error('[axon-v0 roster/fire]', raw);
    return NextResponse.json({ fired: false, reason: 'Could not fire this agent. Check server credentials and try again.' }, { status: 500 });
  }
}
