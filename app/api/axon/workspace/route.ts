import { NextResponse } from 'next/server';
import {
  applyBriefingUpdates,
  applyTodoUpdates,
  getWorkspace,
  removeBriefing,
  removeTodo,
  setWorkspaceFlags,
  toggleTodo,
} from '@/lib/axon-workspace';

export async function GET() {
  try {
    const workspace = await getWorkspace();
    return NextResponse.json({ workspace });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load workspace' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    if (body.toggle_todo_id) {
      const workspace = await toggleTodo(body.toggle_todo_id);
      return NextResponse.json({ workspace });
    }

    if (body.remove_todo_id) {
      const workspace = await removeTodo(body.remove_todo_id);
      return NextResponse.json({ workspace });
    }

    if (body.remove_briefing_id) {
      const workspace = await removeBriefing(body.remove_briefing_id);
      return NextResponse.json({ workspace });
    }

    if (body.briefing_autonomous !== undefined || body.todos_autonomous !== undefined) {
      const workspace = await setWorkspaceFlags({
        briefing_autonomous: body.briefing_autonomous,
        todos_autonomous: body.todos_autonomous,
      });
      return NextResponse.json({ workspace });
    }

    if (body.briefing_updates?.length) {
      const workspace = await applyBriefingUpdates(body.briefing_updates);
      return NextResponse.json({ workspace });
    }

    if (body.todo_updates?.length) {
      const workspace = await applyTodoUpdates(body.todo_updates);
      return NextResponse.json({ workspace });
    }

    return NextResponse.json({ error: 'No valid workspace action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Workspace update failed' },
      { status: 500 }
    );
  }
}
