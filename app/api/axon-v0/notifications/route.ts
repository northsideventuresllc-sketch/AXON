import { NextResponse } from 'next/server';
import { listVentures, listMessages } from '@/lib/axon-v0/store';

// Notifications are derived from the account-wide agent message bus: for every
// venture we pull recent group-thread messages, keep only the agent (non-user)
// lines, and shape each as a notification. No dedicated ni_notifications table —
// the ventures' own agents are the source. Never 500 the home page: any failure
// yields an empty list.
export const dynamic = 'force-dynamic';

interface Notification {
  id: string;
  ventureId: string;
  ventureName: string;
  title: string;
  body: string;
  agentName: string;
  created_at: string;
  thread: string;
}

const isUser = (sender: string) => {
  const s = (sender || '').trim().toLowerCase();
  return s === 'user' || s === 'jb' || s === 'you' || s === 'jonny';
};

export async function GET() {
  try {
    const ventures = await listVentures();
    const all: Notification[] = [];

    for (const v of ventures) {
      let msgs: Array<{
        id: string;
        thread: string;
        sender: string;
        content: string;
        created_at: string;
      }> = [];
      try {
        msgs = (await listMessages(v.id, 'group', 20)) as typeof msgs;
      } catch {
        msgs = [];
      }
      for (const m of msgs) {
        if (isUser(m.sender)) continue;
        const agentName = m.sender || 'Agent';
        all.push({
          id: m.id,
          ventureId: v.id,
          ventureName: v.name,
          title: `${agentName} · ${v.name}`,
          body: m.content || '',
          agentName,
          created_at: m.created_at,
          thread: m.thread || 'group',
        });
      }
    }

    all.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

    return NextResponse.json({ notifications: all.slice(0, 40) });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}
