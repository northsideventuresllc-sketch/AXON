import { NextRequest, NextResponse } from 'next/server';
import { getItSkeletonBySlug } from '@/lib/axon/it-axon-skeleton';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export const dynamic = 'force-dynamic';

const sessions = new Map<
  string,
  { slug: string; messages: { role: string; content: string }[]; toolHref: string }
>();

function newSessionId() {
  return `itb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(req: NextRequest) {
  try {
    await requireAxonOperatorId();
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (action === 'start') {
      const slug = typeof body?.slug === 'string' ? body.slug : '';
      const skeleton = getItSkeletonBySlug(slug);
      if (!skeleton) {
        return NextResponse.json({ ok: false, error: 'Unknown IT slug' }, { status: 400 });
      }

      const sessionId = newSessionId();
      const toolHref = `/tools/it-clone/${slug}`;
      const systemMsg = {
        role: 'assistant',
        content:
          `Starting AXON Toolbox build for ${skeleton.name}. ` +
          `I'll scaffold an MVP panel that mirrors your IT subscription — personal to your AXON workspace only. ` +
          `Prompt seed: ${skeleton.defaultPrompt.slice(0, 120)}…`,
      };
      const messages = [systemMsg];
      sessions.set(sessionId, { slug, messages, toolHref });

      return NextResponse.json({ ok: true, sessionId, messages, toolHref });
    }

    if (action === 'chat') {
      const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
      const message = typeof body?.message === 'string' ? body.message.trim() : '';
      const session = sessions.get(sessionId);
      if (!session || !message) {
        return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 400 });
      }

      session.messages.push({ role: 'user', content: message });
      const skeleton = getItSkeletonBySlug(session.slug);
      const reply =
        `Noted. For ${skeleton?.name ?? session.slug}: I'll queue scaffold files under ` +
        `\`/tools/it-clone/${session.slug}\` when the coding window ships. ` +
        `Your changes stay in AXON only — the live IT product is unchanged.`;
      session.messages.push({ role: 'assistant', content: reply });

      return NextResponse.json({
        ok: true,
        reply,
        toolHref: session.toolHref,
      });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'builder failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
