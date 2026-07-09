import { NextRequest, NextResponse } from 'next/server';
import { getItSkeletonBySlug } from '@/lib/it-axon-skeleton';
import { AXON_USER_TOOLS } from '@/lib/axon-user-tools';
import { getAxonToolMeta } from '@/lib/axon-tool-meta';

export const dynamic = 'force-dynamic';

type Session = {
  kind: 'it' | 'axon-tool';
  slug: string;
  messages: { role: string; content: string }[];
  toolHref: string;
};

const sessions = new Map<string, Session>();

function newSessionId() {
  return `itb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (action === 'start') {
      const axonTool = typeof body?.axonTool === 'string' ? body.axonTool : '';
      if (axonTool) {
        const tool = AXON_USER_TOOLS.find((t) => t.slug === axonTool);
        if (!tool) {
          return NextResponse.json({ ok: false, error: 'Unknown AXON tool' }, { status: 400 });
        }
        const meta = getAxonToolMeta(tool);
        const sessionId = newSessionId();
        const toolHref = tool.href;
        const systemMsg = {
          role: 'assistant',
          content:
            `Ready to adjust ${tool.defaultDisplayName}. ` +
            `Current setup: ${meta.setupDescription} ` +
            `Seed: ${meta.builderPrompt.slice(0, 160)}…`,
        };
        const messages = [systemMsg];
        sessions.set(sessionId, { kind: 'axon-tool', slug: axonTool, messages, toolHref });
        return NextResponse.json({ ok: true, sessionId, messages, toolHref });
      }

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
      sessions.set(sessionId, { kind: 'it', slug, messages, toolHref });

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
      const reply =
        session.kind === 'axon-tool'
          ? `Noted for ${session.slug}. I'll queue AXON-only adjustments when the coding window ships — your live NI tools stay unchanged.`
          : `Noted. For ${session.slug}: I'll queue scaffold files under \`/tools/it-clone/${session.slug}\` when the coding window ships.`;
      session.messages.push({ role: 'assistant', content: reply });

      return NextResponse.json({
        ok: true,
        reply,
        toolHref: session.toolHref,
      });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'builder failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
