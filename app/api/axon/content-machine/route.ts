import { NextResponse } from 'next/server';
import {
  applyContentAction,
  fetchContentPosts,
  FIRE_ONLY_ACTIONS,
  HOLD_SAFE_ACTIONS,
} from '@/lib/axon-content-machine';
import { assertFireAllowed, FireHoldError } from '@/lib/axon-fire-gate';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { posts, live } = await fetchContentPosts();
    return NextResponse.json({ ok: true, live, posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'content load failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      postId?: string;
      caption?: string;
    };
    const action = String(body?.action || '').toLowerCase();
    const postId = String(body?.postId || '');
    if (!action || !postId) {
      return NextResponse.json({ ok: false, error: 'action and postId required' }, { status: 400 });
    }
    if (!HOLD_SAFE_ACTIONS.has(action) && !FIRE_ONLY_ACTIONS.has(action)) {
      return NextResponse.json({ ok: false, error: `unknown action "${action}"` }, { status: 400 });
    }
    // Publish + schedule push content live — gate them.
    if (FIRE_ONLY_ACTIONS.has(action)) {
      await assertFireAllowed(`content.${action}`);
    }
    const result = await applyContentAction(action, postId, { caption: body?.caption });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FireHoldError) {
      return NextResponse.json(
        { ok: false, error: err.message, hold: true, action: err.action },
        { status: 423 },
      );
    }
    const message = err instanceof Error ? err.message : 'content action failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
