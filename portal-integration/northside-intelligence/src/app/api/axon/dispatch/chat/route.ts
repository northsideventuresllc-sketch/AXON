import { NextRequest, NextResponse } from 'next/server';
import { fetchDispatchTask, deriveVenture, deriveComplexity } from '@/lib/axon/agent-dispatch';
import { requireAxonOperatorId } from '@/lib/axon/operator';
import { HAIKU_MODEL } from '@/lib/axon/constants.mjs';

export const dynamic = 'force-dynamic';

const GEMINI_MODEL = 'gemini-2.0-flash';

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

async function callGeminiOnce(apiKey: string, system: string, user: string): Promise<string | null> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.4 },
      }),
    }
  );
  if (!r.ok) return null;
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text)
    .join('')
    ?.trim();
  return text || null;
}

/** Free-tier Gemini first, paid Haiku only if Gemini is unconfigured or fails. */
async function callChatModel(
  keys: { anthropicKey?: string; geminiKey?: string; geminiBackup?: string },
  system: string,
  user: string
): Promise<string> {
  for (const key of [keys.geminiKey, keys.geminiBackup].filter((k): k is string => Boolean(k))) {
    try {
      const text = await callGeminiOnce(key, system, user);
      if (text) return text;
    } catch {
      // try next key / fall through to Haiku
    }
  }
  if (!keys.anthropicKey) throw new Error('No AI provider configured');
  return callHaiku(keys.anthropicKey, system, user);
}

export async function POST(req: NextRequest) {
  try {
    await requireAxonOperatorId();
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
    const geminiKey = process.env.GEMINI_API_KEY;
    const geminiBackup = process.env.GEMINI_API_KEY_BACKUP;
    if (!apiKey && !geminiKey) {
      return NextResponse.json({ ok: false, error: 'No AI provider configured' }, { status: 500 });
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

    const reply = await callChatModel(
      { anthropicKey: apiKey, geminiKey, geminiBackup },
      system,
      userPrompt
    );
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'chat failed';
    const status = msg === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
