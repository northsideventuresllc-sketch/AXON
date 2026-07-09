import { NextResponse } from 'next/server';
import { generateAxonReply } from '@/lib/axon-web-chat';
import { fetchChatHistory } from '@/lib/axon-profile';
import { getMessagesForSession } from '@/lib/axon-chat-sessions';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 40));
    const messages = await fetchChatHistory(undefined, limit);
    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load chat' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { message, channel = 'chat', sessionId, notificationContext } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const allHistory = await fetchChatHistory(undefined, 200);
    const history = sessionId ? getMessagesForSession(allHistory, sessionId) : allHistory;
    const result = await generateAxonReply(
      message.trim(),
      channel,
      history,
      sessionId,
      notificationContext
    );

    return NextResponse.json({
      reply: result.reply,
      userMsg: result.userMsg,
      assistantMsg: result.assistantMsg,
      workspace: result.workspace,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
