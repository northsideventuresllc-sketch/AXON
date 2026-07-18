import { NextResponse } from 'next/server';
import { REDDIT_ACCOUNT, REDDIT_PROMO_QUEUE, REDDIT_REPLY_QUEUE } from '@/lib/axon-tools-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    live: false,
    account: REDDIT_ACCOUNT,
    promo: REDDIT_PROMO_QUEUE,
    replies: REDDIT_REPLY_QUEUE,
  });
}
