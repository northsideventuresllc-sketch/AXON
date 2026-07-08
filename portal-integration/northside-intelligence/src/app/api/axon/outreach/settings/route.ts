import { NextResponse } from 'next/server';
import {
  getOutreachSettings,
  saveOutreachSettings,
  type OutreachSettings,
} from '@/lib/axon/outreach-settings';

export async function GET() {
  try {
    const settings = await getOutreachSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load settings' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Partial<OutreachSettings>;
    const settings = await saveOutreachSettings(body);
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save settings' },
      { status: 500 }
    );
  }
}
