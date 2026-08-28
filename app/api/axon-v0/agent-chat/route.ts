import { NextResponse } from 'next/server';
import { generateAxonReply } from '@/lib/axon-web-chat';
import { routeFixedIfAssigned } from '@/lib/axon-v0/omni-router';
import { shouldUseComputerUse } from '@/lib/axon-computer-use-router';
import { runComputerUseTask } from '@/lib/axon-computer-use.mjs';
import {
  addMessage,
  crossVentureContext,
  listAgents,
  listMessages,
  listVentures,
  listVentureTools,
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
    const { ventureId, agentId, message, thread = 'group', forceComputerUse } = await req.json();
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

    // Router: computer_use (task needs clicking/navigating an app with no API) checked
    // first — same failover posture as model selection, just picking a capability
    // instead of a provider. `forceComputerUse` lets a scripted/manual trigger (e.g. the
    // first-test task) skip the classifier and go straight there. Otherwise fall to the
    // existing Omni-Router: fixed provider if assigned, else the canonical AXON tier chain.
    let reply: string;
    let route: string;
    const useComputerUse = forceComputerUse === true || (await shouldUseComputerUse(message.trim()));
    if (useComputerUse) {
      const cu = await runComputerUseTask({
        taskDescription: message.trim(),
        systemNote: contextPrompt,
      });
      reply = cu.finalText || `Computer-use task ${cu.outcome} after ${cu.steps} step(s).`;
      route = `computer_use (${cu.outcome})`;
    } else {
      const fixed = await routeFixedIfAssigned(agent.id, [
        { role: 'system', content: contextPrompt },
        { role: 'user', content: message.trim() },
      ]);
      if (fixed) {
        reply = fixed.reply;
        route = fixed.route;
      } else {
        const result = await generateAxonReply(message.trim(), 'chat', [], undefined, {
          title: `${agent.name} — ${venture.name}`,
          source: 'axon-v0-venture',
          prompt: contextPrompt,
        });
        reply = result.reply;
        route = 'AXON auto (tier chain)';
      }
    }

    const agentMsg = await addMessage({
      venture_id: ventureId,
      agent_id: agent.id,
      thread,
      sender: agent.name,
      content: reply,
      meta: { route },
    } as any);

    return NextResponse.json({ userMsg, agentMsg, route });
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
