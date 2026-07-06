import { NextResponse } from "next/server";
import {
  applyBriefingUpdates,
  applyTodoUpdates,
  getWorkspace,
  removeBriefing,
  removeTodo,
  setWorkspaceFlags,
  toggleTodo,
} from "@/lib/axon/axon-workspace";
import { requireAxonOperatorId } from "@/lib/axon/operator";

export async function GET() {
  try {
    const operatorId = await requireAxonOperatorId();
    const workspace = await getWorkspace(operatorId);
    return NextResponse.json({ workspace });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load workspace";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const operatorId = await requireAxonOperatorId();
    const body = await req.json();

    if (body.toggle_todo_id) {
      const workspace = await toggleTodo(body.toggle_todo_id, operatorId);
      return NextResponse.json({ workspace });
    }

    if (body.remove_todo_id) {
      const workspace = await removeTodo(body.remove_todo_id, operatorId);
      return NextResponse.json({ workspace });
    }

    if (body.remove_briefing_id) {
      const workspace = await removeBriefing(body.remove_briefing_id, operatorId);
      return NextResponse.json({ workspace });
    }

    if (body.briefing_autonomous !== undefined || body.todos_autonomous !== undefined) {
      const workspace = await setWorkspaceFlags(
        {
          briefing_autonomous: body.briefing_autonomous,
          todos_autonomous: body.todos_autonomous,
        },
        operatorId
      );
      return NextResponse.json({ workspace });
    }

    if (body.briefing_updates?.length) {
      const workspace = await applyBriefingUpdates(body.briefing_updates, operatorId);
      return NextResponse.json({ workspace });
    }

    if (body.todo_updates?.length) {
      const workspace = await applyTodoUpdates(body.todo_updates, operatorId);
      return NextResponse.json({ workspace });
    }

    return NextResponse.json({ error: "No valid workspace action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workspace update failed";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
