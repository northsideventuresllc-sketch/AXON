import { NextResponse } from 'next/server';
import { routeChat } from '@/lib/axon-router';
import { getPreferences } from '@/lib/axon-preferences';
import { POWER_LEVEL_TO_COST_TIER_FLOOR } from '@/lib/axon-types';
import {
  addMessage,
  crossVentureContext,
  getAccount,
  getAssignment,
  listAgents,
  listMessages,
  listVentures,
  listVentureTools,
  supabaseKey,
} from '@/lib/axon-v0/store';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ventureId = searchParams.get('ventureId');
    const thread = searchParams.get('thread') || 'group';
    if (!ventureId) return NextResponse.json({ error: 'ventureId required' }, { status: 400 });
    const messages = await listMessages(ventureId, thread);
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load messages' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { ventureId, agentId, message, thread = 'group' } = await req.json();
    if (!ventureId || !message?.trim()) {
      return NextResponse.json({ error: 'ventureId and message required' }, { status: 400 });
    }

    const ventures = await listVentures();
    const venture = ventures.find((v) => v.id === ventureId);
    if (!venture) return NextResponse.json({ error: 'Unknown venture' }, { status: 404 });

    const agents = await listAgents(ventureId);
    const agent = agentId
      ? agents.find((a) => a.id === agentId)
      : agents.find((a) => a.role === 'exec_assistant');
    if (!agent) return NextResponse.json({ error: 'Unknown agent' }, { status: 404 });

    const userMsg = await addMessage({
      venture_id: ventureId,
      agent_id: null,
      thread,
      sender: 'user',
      content: message.trim(),
      meta: {},
    } as any);

    // Everything connected: venture history + tools + recent activity from the
    // OTHER ventures' rooms feeds every agent reply.
    const history = await listMessages(ventureId, thread, 24);
    const tools = await listVentureTools(ventureId);
    const otherVentures = await crossVentureContext(ventureId);
    const contextPrompt = [
      `You are ${agent.name} for the venture "${venture.name}"${venture.tagline ? ` (${venture.tagline})` : ''}.`,
      agent.description || '',
      agent.role === 'exec_assistant'
        ? 'You are the captain of this venture: you manage the Build Manager, Pulse, Council and Creator agents, consult the Council before pulling the operator in, and coordinate with the other ventures’ exec assistants.'
        : '',
      tools.length
        ? `Tools assigned to this venture: ${tools.map((t) => t.display_name || t.tool_slug).join(', ')}.`
        : '',
      otherVentures
        ? `Recent activity across the operator's other ventures (you may reference and coordinate with them):\n${otherVentures}`
        : '',
      `Recent room conversation:\n${history
        .slice(-12)
        .map((m) => `${m.sender}: ${m.content.slice(0, 200)}`)
        .join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    // Omni Router — one entry point. 'fixed' honours the operator's pin, 'auto' scores every
    // connected lane on capability fit x cost x live health and records WHY it picked one.
    const assignment = await getAssignment(agent.id);
    const account = await getAccount();
    // Operator's manual power-bar lock (Settings > Models & routing > Power mode). Only
    // constrains the 'auto' scoring path — a per-agent pin (assignment.mode === 'fixed')
    // still wins outright, same as before this existed.
    const powerMode = (await getPreferences()).powerMode;
    const costTierFloor = powerMode.autoSwitchEnabled ? null : POWER_LEVEL_TO_COST_TIER_FLOOR[powerMode.level];
    const routed = await routeChat(supabaseKey(), {
      messages: [
        { role: 'system', content: contextPrompt },
        { role: 'user', content: message.trim() },
      ],
      mode: assignment?.mode === 'fixed' ? 'fixed' : 'auto',
      laneOverride: (assignment as { lane_id?: string } | null)?.lane_id ?? null,
      fixedOrder: (assignment as { fixed_order?: string[] } | null)?.fixed_order ?? null,
      accountId: account?.id ?? null,
      agentId: agent.id,
      agentRole: agent.role,
      hasMini: !!account?.has_mini_access,
      venture: venture.name,
      requestId: userMsg?.id ?? null,
      costTierFloor,
    });

    const agentMsg = await addMessage({
      venture_id: ventureId,
      agent_id: agent.id,
      thread,
      sender: agent.name,
      content: routed.reply,
      meta: {
        route: routed.route,
        capability: routed.capabilityClass,
        decision_id: routed.decisionId,
      },
    } as any);

    return NextResponse.json({
      userMsg,
      agentMsg,
      route: routed.route,
      capability: routed.capabilityClass,
      decisionId: routed.decisionId,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Agent chat failed';
    // Keep infrastructure jargon off the operator's screen.
    const friendly = /supabase|http \d|fetch failed|econn/i.test(raw)
      ? 'The router could not reach its model keys. Check server credentials and try again.'
      : raw;
    console.error('[axon-v0 agent-chat]', raw);
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
