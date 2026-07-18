import { NextResponse } from 'next/server';
import {
  LUCIELLE_CONNECTORS,
  LUCIELLE_HIERARCHY,
  LUCIELLE_VIEWS,
} from '@/lib/axon-tools-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    live: false,
    hierarchy: LUCIELLE_HIERARCHY,
    views: LUCIELLE_VIEWS,
    connectors: LUCIELLE_CONNECTORS,
  });
}
