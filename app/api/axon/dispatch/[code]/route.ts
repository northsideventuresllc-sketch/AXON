import { NextRequest, NextResponse } from 'next/server';
import { fetchDispatchTask, updateDispatchTask } from '@/lib/agent-dispatch';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const task = await fetchDispatchTask(params.code);
    if (!task) return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === 'string' ? body.title.trim() : undefined;
    const dispatch_phrase =
      body?.dispatch_phrase === null || typeof body?.dispatch_phrase === 'string'
        ? body.dispatch_phrase
        : undefined;
    if (title === undefined && dispatch_phrase === undefined) {
      return NextResponse.json({ ok: false, error: 'No fields to update' }, { status: 400 });
    }
    const task = await updateDispatchTask(params.code, { title, dispatch_phrase });
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
