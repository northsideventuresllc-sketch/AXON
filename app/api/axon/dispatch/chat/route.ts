import { NextRequest, NextResponse } from 'next/server';
import { fetchDispatchTask, deriveVenture, deriveComplexity } from '@/lib/agent-dispatch';
import { routeChat } from '@/lib/axon-router';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!code || !message) {
      return NextResponse.json({ ok: false, error: 'code and message required' }, { status: 400 });
    }

    const task = await fetchDispatchTask(code);
    if (!task) return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });

    const venture = deriveVenture(task);
    const complexity = deriveComplexity(task);
    const system = `You are AXON Repo Manager assistant for operator JB at Northside Intelligence.
Explain dispatch tasks plainly. You can suggest edits to title or description (dispatch_phrase).
If the user asks to change the task, respond with what you would change and why — they apply edits in the UI.
Keep answers concise (under 120 words unless asked for detail).`;

    const taskContext = `Task ${task.code}: "${task.title}"
Venture: ${venture} · Complexity: ${complexity} · Status: ${task.status}
Repo: ${task.repo || task.workflow_repo || '—'}
Description: ${task.dispatch_phrase || '(none)'}
Action: ${task.action_type} · Priority: ${task.priority}`;

    const prior = history
      .slice(-6)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join('\n');

    const userPrompt = `${taskContext}\n\n${prior ? `Prior chat:\n${prior}\n\n` : ''}Operator: ${message}`;

    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    const routed = await routeChat(supabaseKey, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      mode: 'auto',
      accountId: null,
      agentRole: 'repo-manager-chat',
      hasMini: false,
      venture,
    });
    return NextResponse.json({ ok: true, reply: routed.reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'chat failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
