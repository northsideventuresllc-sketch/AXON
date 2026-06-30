import { NextResponse } from 'next/server';
import { fetchPipelineStats } from '@/lib/leads';

export async function GET() {
  try {
    const stats = await fetchPipelineStats();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load stats' },
      { status: 500 }
    );
  }
}
