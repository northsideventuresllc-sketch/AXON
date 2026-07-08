import { NextResponse } from 'next/server';
import { fetchDispatchQueue } from '@/lib/agent-dispatch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await fetchDispatchQueue();
    return NextResponse.json({ ok: true, count: rows.length, items: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'queue fetch failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
