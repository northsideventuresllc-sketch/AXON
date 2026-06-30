import { NextResponse } from 'next/server';
import { refreshTonePresetFromSignals } from '@/lib/axon-chat';

/** Background tone refresh — infuses latest signal patterns into preset */
export async function POST() {
  try {
    const preset = await refreshTonePresetFromSignals();
    return NextResponse.json({ ok: true, tone_preset: preset });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 }
    );
  }
}
