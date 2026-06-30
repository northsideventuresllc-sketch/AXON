import { NextResponse } from 'next/server';
import { resetOperatorData } from '@/lib/axon-profile';
import { OPERATOR_ID } from '@/lib/axon-types';

const MESSAGES: Record<string, string> = {
  memories_before: 'Memories before the selected date have been cleared.',
  communication: 'Communication learnings reset. AXON returns to default tone signals.',
  context: 'Context and memories cleared. Chat history preserved.',
  full: 'Full clean slate. AXON is back to default starting mode.',
};

export async function POST(req: Request) {
  try {
    const { scope, beforeDate } = await req.json();
    const valid = ['memories_before', 'communication', 'context', 'full'];
    if (!valid.includes(scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    if (scope === 'memories_before' && !beforeDate) {
      return NextResponse.json({ error: 'beforeDate required' }, { status: 400 });
    }

    await resetOperatorData(OPERATOR_ID, scope, beforeDate ? `${beforeDate}T00:00:00Z` : undefined);
    return NextResponse.json({ ok: true, message: MESSAGES[scope] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reset failed' },
      { status: 500 }
    );
  }
}
