import { NextResponse } from 'next/server';
import { routeChat } from '@/lib/axon-router';

// Public "continue as guest" demo chat. Limited on purpose: no operator profile,
// no memories, no ventures, no brain — just the Omni Router with accountId: null
// (falls open to the global lane catalog) and hasMini: false (never routes to the
// Mac mini's local model). This is the SAME router agent-chat uses, so a lane-order
// fix in router_models (e.g. OpenRouter free models ranked above the local 7B)
// reaches guests too. Previously this called generateAxonReply, whose callChatModel
// is a separate hardcoded chain (AXON-local -> RunPod stub -> Gemini -> paid Haiku)
// that never touches router_routes/router_models — guests always got axon-ornith
// (or paid Anthropic) regardless of any lane-order change. Fixed 2026-08-28.

const GUEST_SYSTEM = [
  'You are AXON in public DEMO mode.',
  'You have NO access to the operator\'s ventures, notifications, brain, vault, files, or any private/account data — do not claim to, and do not invent any.',
  'Behave as a helpful, concise general assistant. If asked about private AXON data or actions, explain that requires signing in with an NI account and AXON code.',
  'Keep replies short.',
].join(' ');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 15;
const MAX_LEN = 600;

// module-level in-memory limiter (per server instance; fine for a demo gate)
const hits: Map<string, number[]> =
  (globalThis as unknown as { __axonGuestHits?: Map<string, number[]> }).__axonGuestHits ||
  ((globalThis as unknown as { __axonGuestHits?: Map<string, number[]> }).__axonGuestHits = new Map());

function ipOf(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0] : '').trim() || 'anon';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    const text = String(message || '').trim();
    if (!text) return NextResponse.json({ error: 'Message required' }, { status: 400 });
    if (text.length > MAX_LEN) {
      return NextResponse.json({ error: `Guest messages are capped at ${MAX_LEN} characters.` }, { status: 400 });
    }
    if (rateLimited(ipOf(req))) {
      return NextResponse.json(
        { error: 'Guest demo limit reached — sign in with your NI account for full access.' },
        { status: 429 }
      );
    }

    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const routed = await routeChat(supabaseKey, {
      messages: [
        { role: 'system', content: GUEST_SYSTEM },
        { role: 'user', content: text },
      ],
      mode: 'auto',
      accountId: null,
      agentRole: 'guest',
      hasMini: false,
    });
    return NextResponse.json({ reply: routed.reply });
  } catch {
    // Never leak infra detail to a public endpoint.
    return NextResponse.json(
      { error: 'The demo is briefly unavailable. Try again in a moment.' },
      { status: 500 }
    );
  }
}
