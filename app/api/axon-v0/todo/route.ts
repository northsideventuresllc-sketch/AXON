import { NextResponse } from 'next/server';
import { listRollingTasks, listQueueRows } from '@/lib/axon-v0/todo-store';
import { groupRollingTasks, buildQueueRows, isoWeekday } from '@/lib/axon-v0/todo-grouping.mjs';

/**
 * Dash → To-Do page data: JB's rolling to-do list (NI-Brain `nvg_rolling_tasks`)
 * shaped into the LOCKED Repeating / Non-repeating / Queue tables, plus the
 * dispatch Queue (`agent_dispatch`). Always 200s so one bad source never blanks
 * the page — matches the roster route's fail-safe shape.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [tasks, queueSource] = await Promise.all([listRollingTasks(), listQueueRows()]);
    const today = new Date();
    const { repeating, nonRepeating } = groupRollingTasks(tasks, {
      dayOfWeek: isoWeekday(today),
      dayOfMonth: today.getDate(),
    });
    const queue = buildQueueRows(queueSource);
    return NextResponse.json({ ok: true, repeating, nonRepeating, queue });
  } catch {
    return NextResponse.json({ ok: true, repeating: [], nonRepeating: [], queue: [] });
  }
}
