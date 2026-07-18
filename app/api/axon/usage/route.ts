import { NextResponse } from 'next/server';
import { USAGE_CONNECTORS, USAGE_VENTURES } from '@/lib/axon-tools-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    live: false,
    connectors: USAGE_CONNECTORS,
    ventures: USAGE_VENTURES,
  });
}
