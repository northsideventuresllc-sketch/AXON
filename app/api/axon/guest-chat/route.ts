import { NextResponse } from 'next/server';
import { generateAxonReply } from '@/lib/axon-web-chat';

// Public "continue as guest" demo chat. Limited on purpose: cheapest/local tier
// first (the tier chain already tries AXON-local before paid models), a short
// per-IP rate limit, a message cap, and a system prompt that walls off all
// private operator data. No history, no ventures, no brain.

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

    const result = await generateAxonReply(text, 'chat', [], undefined, {
      title: 'AXON guest demo',
      source: 'axon-guest',
      prompt: GUEST_SYSTEM,
    });
    return NextResponse.json({ reply: result.reply });
  } catch {
    // Never leak infra detail to a public endpoint.
    return NextResponse.json(
      { error: 'The demo is briefly unavailable. Try again in a moment.' },
      { status: 500 }
    );
  }
}
