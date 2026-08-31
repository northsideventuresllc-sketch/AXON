import { NextResponse } from 'next/server';
import { fireAgent } from '@/lib/axon-agent-bus';
import { validateCrossVentureDispatch } from '@/lib/axon-v0/cross-venture-dispatch.mjs';
import { getAccount, listAgents, listVentures } from '@/lib/axon-v0/store';

/**
 * AXON usability item #6 — cross-venture dispatch. Hands a task from an agent in one
 * venture to an agent in a DIFFERENT venture, entirely through the one real fireAgent()
 * path (lib/axon-agent-bus.mjs) and its existing loop guards / FIRE-HOLD gate / authority
 * checks — this route adds nothing on top of that except:
 *   1. Looking both agents up so the operator's picker can send bare ids.
 *   2. validateCrossVentureDispatch() — refuses a same-venture "dispatch" (that's just
 *      the venture room's own chat, already served by /api/axon-v0/agent-chat).
 * Never bypasses fireAgent's own gate/authority/budget checks and never re-implements
 * them — a HOLD refusal or an authority refusal from fireAgent() comes back to the caller
 * exactly as fireAgent returned it.
 */
export async function POST(req: Request) {
  try {
    const { fromAgentId, toAgentId, task } = await req.json();
    if (!fromAgentId || !toAgentId || !task?.trim()) {
      return NextResponse.json({ error: 'fromAgentId, toAgentId and task are required' }, { status: 400 });
    }

    const [agents, ventures, account] = await Promise.all([listAgents(), listVentures(), getAccount()]);
    const fromAgent = agents.find((a) => a.id === fromAgentId) || null;
    const toAgent = agents.find((a) => a.id === toAgentId) || null;

    const check = validateCrossVentureDispatch({ fromAgent, toAgent, task });
    if (!check.allowed) {
      return NextResponse.json({ ok: false, reason: check.reason }, { status: 400 });
    }

    const toVenture = ventures.find((v) => v.id === toAgent!.venture_id) || null;

    // Root dispatch: the operator, not another agent, initiated this hop — depth 1,
    // hopCount 0, empty chain, same defaults fireAgent() documents for "a root agent
    // firing its first hop". Any fire_agent tool call the target's own reply makes goes
    // back through this exact same fireAgent(), with depth/hopCount/chain carried
    // forward by routeChat — never a second implementation of the guard.
    const result = await fireAgent({
      fromAgentId,
      toAgentId,
      ventureId: toAgent!.venture_id,
      task: task.trim(),
      accountId: account?.id ?? null,
    });

    return NextResponse.json({
      ...result,
      fromAgentName: fromAgent!.name,
      toAgentName: toAgent!.name,
      toVentureName: toVenture?.name || null,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Dispatch failed';
    const friendly = /supabase|http \d|fetch failed|econn/i.test(raw)
      ? 'Could not reach the agent bus. Check server credentials and try again.'
      : raw;
    console.error('[axon-v0 dispatch]', raw);
    return NextResponse.json({ ok: false, reason: friendly }, { status: 500 });
  }
}
