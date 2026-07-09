import { NextResponse } from 'next/server';
import { getClient, enrichLead } from '@/lib/axon/leads';
import { SOURCE } from '@/lib/axon/constants.mjs';
import { requireAxonOperatorId } from '@/lib/axon/operator';
import type { Lead } from '@/lib/axon/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAxonOperatorId();
    const { sbSelect } = getClient();
    const rows = (await sbSelect(
      'ni_brain_outreach',
      `source=eq.${SOURCE}&status=in.(closed_won,sent)&select=*&order=created_at.desc&limit=200`,
    )) as Lead[];

    const leads = (rows || []).map(enrichLead).map((l) => ({
      id: l.id,
      handle: l.handle,
      status: l.status,
      niche: l.niche,
      notes: l.notes,
      created_at: l.created_at,
    }));

    return NextResponse.json({ ok: true, count: leads.length, leads });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'deals fetch failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
