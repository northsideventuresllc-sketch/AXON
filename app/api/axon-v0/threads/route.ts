import { NextResponse } from 'next/server';
import { listThreads } from '@/lib/axon-v0/store';

// Saved-chats sidebar data. Auth is enforced by middleware.ts for every non-public
// path (this one isn't in PUBLIC_PATHS), so a request that reaches this handler is
// already a signed-in operator — listThreads itself account-scopes via accountId().
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ventureId = searchParams.get('ventureId');
    if (!ventureId) return NextResponse.json({ error: 'ventureId required' }, { status: 400 });
    const threads = await listThreads(ventureId);
    return NextResponse.json({ threads });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load saved chats' },
      { status: 500 }
    );
  }
}
