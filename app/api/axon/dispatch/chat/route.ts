import { NextRequest, NextResponse } from 'next/server';
import { fetchDispatchTask, deriveVenture, deriveComplexity } from '@/lib/agent-dispatch';
import { HAIKU_MODEL } from '@/lib/constants.mjs';

export const dynamic = 'force-dynamic';

async function callHaiku(apiKey: string, system: string, user: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`Anthropic ${r.status}: ${err.slice(0, 120)}`);
  }
  const data = await r.json();
  const block = data.content?.find((b: { type: string }) => b.type === 'text');
  return block?.text?.trim() || 'No response.';
}

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const venture = deriveVenture(task);
    const complexity = deriveComplexity(task);
    const system = `You are AXON Repo Manager assistant for operator JB at NORTHSiDE Intelligence.
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

    const reply = await callHaiku(apiKey, system, userPrompt);
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'chat failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
