import { NextResponse } from 'next/server';
import {
  applyContentAction,
  fetchContentPosts,
  FIRE_ONLY_ACTIONS,
  HOLD_SAFE_ACTIONS,
} from '@/lib/axon-content-machine';
import { assertFireAllowed, FireHoldError } from '@/lib/axon-fire-gate';
import { learnStep } from '@/lib/axon-step-learn';

export const dynamic = 'force-dynamic';

const CONTENT_VENTURE = 'NORTHSiDE Intelligence';

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
  let action = '';
  let postId = '';
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      postId?: string;
      caption?: string;
    };
    action = String(body?.action || '').toLowerCase();
    postId = String(body?.postId || '');
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
    // Learn from every successful step (approve/edit/adjust/optimize/reject and,
    // when fired, publish/schedule). Fire-and-forget — never blocks the response.
    learnStep({
      tool: 'content-machine',
      step: action,
      after: result.status,
      venture: CONTENT_VENTURE,
      resourceId: postId,
      meta: {
        postId,
        ...(action === 'edit' && body?.caption ? { caption: body.caption } : {}),
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FireHoldError) {
      // A HOLD block is still a learning signal — record what was attempted.
      learnStep({
        tool: 'content-machine',
        step: err.action.replace(/^content\./, ''),
        hold: true,
        venture: CONTENT_VENTURE,
        resourceId: postId || undefined,
        meta: { postId, blockedAction: err.action },
      });
      return NextResponse.json(
        { ok: false, error: err.message, hold: true, action: err.action },
        { status: 423 },
      );
    }
    const message = err instanceof Error ? err.message : 'content action failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
