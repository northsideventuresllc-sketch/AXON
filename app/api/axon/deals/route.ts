import { NextResponse } from 'next/server';
import { getClient, enrichLead } from '@/lib/leads';
import { SOURCE } from '@/lib/constants.mjs';
import type { Lead } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
