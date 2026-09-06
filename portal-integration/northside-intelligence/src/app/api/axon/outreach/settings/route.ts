import { NextResponse } from 'next/server';
import {
  getOutreachSettings,
  saveOutreachSettings,
  type OutreachSettings,
} from '@/lib/axon/outreach-settings';
import { requireAxonOperatorId } from '@/lib/axon/operator';

export async function GET() {
  try {
    await requireAxonOperatorId();
    const settings = await getOutreachSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load settings';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAxonOperatorId();
    const body = (await req.json()) as Partial<OutreachSettings>;
    const settings = await saveOutreachSettings(body);
    return NextResponse.json({ settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
