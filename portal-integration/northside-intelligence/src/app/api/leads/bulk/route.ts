import { NextResponse } from 'next/server';
import { bulkUpdateLeads } from '@/lib/axon/leads';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export async function POST(req: Request) {
  try {
    await requireAxonOperatorId();
    const body = await req.json();
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    if (!ids.length) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }

    const action = body.action as 'status' | 'archive';

    if (action === 'archive') {
      const now = new Date().toISOString();
      await bulkUpdateLeads(ids, {
        status: 'archived',
        metaPatch: { archived_at: now, archived_from: 'manual' },
      });
      return NextResponse.json({ message: `Archived ${ids.length} lead(s)` });
    }

    if (action === 'status') {
      const status = body.status as string;
      if (!status) {
        return NextResponse.json({ error: 'Status required' }, { status: 400 });
      }
      await bulkUpdateLeads(ids, { status });
      return NextResponse.json({ message: `Updated ${ids.length} lead(s) to ${status}` });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bulk update failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
