import { getOperatorProfile, updateOperatorProfile } from './axon-profile';
import {
  DEFAULT_WORKSPACE,
  type AxonWorkspace,
  type BriefingItem,
  type BriefingPriority,
  type TodoItem,
} from './axon-types';

function parseWorkspace(contextData: Record<string, unknown> | null | undefined): AxonWorkspace {
  const raw = contextData?.workspace as Partial<AxonWorkspace> | undefined;
  if (!raw) return { ...DEFAULT_WORKSPACE };

  return {
    briefing: Array.isArray(raw.briefing) ? raw.briefing : [],
    todos: Array.isArray(raw.todos) ? raw.todos : [],
    briefing_autonomous: Boolean(raw.briefing_autonomous),
    todos_autonomous: Boolean(raw.todos_autonomous),
    last_briefing_refresh: raw.last_briefing_refresh,
    last_todo_refresh: raw.last_todo_refresh,
  };
}

export async function getWorkspace(operatorId = 'default'): Promise<AxonWorkspace> {
  const profile = await getOperatorProfile(operatorId);
  return parseWorkspace(profile.context_data);
}

async function saveWorkspace(operatorId: string, workspace: AxonWorkspace) {
  const profile = await getOperatorProfile(operatorId);
  await updateOperatorProfile(operatorId, {
    context_data: {
      ...profile.context_data,
      workspace,
    },
  });
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function applyBriefingUpdates(
  updates: Array<{
    action: 'add' | 'update' | 'remove';
    id?: string;
    title?: string;
    content?: string;
    priority?: BriefingPriority;
    source?: 'user' | 'axon';
  }>,
  operatorId = 'default'
): Promise<AxonWorkspace> {
  if (!updates.length) return getWorkspace(operatorId);

  const workspace = await getWorkspace(operatorId);
  const now = new Date().toISOString();
  let briefing = [...workspace.briefing];

  for (const u of updates) {
    if (u.action === 'add' && u.title) {
      briefing.unshift({
        id: newId('brief'),
        title: u.title,
        content: u.content || '',
        priority: u.priority || 'medium',
        source: u.source || 'axon',
        created_at: now,
        updated_at: now,
      });
    } else if (u.action === 'update' && u.id) {
      briefing = briefing.map((b) =>
        b.id === u.id
          ? {
              ...b,
              title: u.title ?? b.title,
              content: u.content ?? b.content,
              priority: u.priority ?? b.priority,
              updated_at: now,
            }
          : b
      );
    } else if (u.action === 'remove' && u.id) {
      briefing = briefing.filter((b) => b.id !== u.id);
    }
  }

  briefing = briefing.slice(0, 12);

  const next: AxonWorkspace = {
    ...workspace,
    briefing,
    last_briefing_refresh: now,
  };
  await saveWorkspace(operatorId, next);
  return next;
}

export async function applyTodoUpdates(
  updates: Array<{
    action: 'add' | 'update' | 'remove' | 'complete';
    id?: string;
    text?: string;
    done?: boolean;
    due?: string | null;
    source?: 'user' | 'axon';
  }>,
  operatorId = 'default'
): Promise<AxonWorkspace> {
  if (!updates.length) return getWorkspace(operatorId);

  const workspace = await getWorkspace(operatorId);
  const now = new Date().toISOString();
  let todos = [...workspace.todos];

  for (const u of updates) {
    if (u.action === 'add' && u.text) {
      todos.unshift({
        id: newId('todo'),
        text: u.text,
        done: false,
        source: u.source || 'axon',
        due: u.due ?? null,
        created_at: now,
        updated_at: now,
      });
    } else if (u.action === 'complete' && u.id) {
      todos = todos.map((t) =>
        t.id === u.id ? { ...t, done: true, updated_at: now } : t
      );
    } else if (u.action === 'update' && u.id) {
      todos = todos.map((t) =>
        t.id === u.id
          ? {
              ...t,
              text: u.text ?? t.text,
              done: u.done ?? t.done,
              due: u.due !== undefined ? u.due : t.due,
              updated_at: now,
            }
          : t
      );
    } else if (u.action === 'remove' && u.id) {
      todos = todos.filter((t) => t.id !== u.id);
    }
  }

  todos = todos.slice(0, 20);

  const next: AxonWorkspace = {
    ...workspace,
    todos,
    last_todo_refresh: now,
  };
  await saveWorkspace(operatorId, next);
  return next;
}

export async function setWorkspaceFlags(
  flags: Partial<Pick<AxonWorkspace, 'briefing_autonomous' | 'todos_autonomous'>>,
  operatorId = 'default'
): Promise<AxonWorkspace> {
  const workspace = await getWorkspace(operatorId);
  const next = { ...workspace, ...flags };
  await saveWorkspace(operatorId, next);
  return next;
}

export async function toggleTodo(id: string, operatorId = 'default'): Promise<AxonWorkspace> {
  const workspace = await getWorkspace(operatorId);
  const now = new Date().toISOString();
  const todos = workspace.todos.map((t) =>
    t.id === id ? { ...t, done: !t.done, updated_at: now } : t
  );
  const next = { ...workspace, todos, last_todo_refresh: now };
  await saveWorkspace(operatorId, next);
  return next;
}

export async function removeBriefing(id: string, operatorId = 'default'): Promise<AxonWorkspace> {
  return applyBriefingUpdates([{ action: 'remove', id }], operatorId);
}

export async function removeTodo(id: string, operatorId = 'default'): Promise<AxonWorkspace> {
  return applyTodoUpdates([{ action: 'remove', id }], operatorId);
}

export function formatWorkspaceForPrompt(workspace: AxonWorkspace): string {
  const briefingBlock = workspace.briefing.length
    ? workspace.briefing
        .map(
          (b: BriefingItem) =>
            `- [${b.id}] ${b.title} (${b.priority}): ${b.content.slice(0, 120)}`
        )
        .join('\n')
    : '(empty — offer to build a daily briefing when asked)';

  const todoBlock = workspace.todos.length
    ? workspace.todos
        .map((t: TodoItem) => `- [${t.id}] ${t.done ? '✓' : '○'} ${t.text}`)
        .join('\n')
    : '(empty — offer to track tasks when asked)';

  return `Current briefing (${workspace.briefing_autonomous ? 'autonomous mode ON' : 'manual'}):
${briefingBlock}

Current to-do list (${workspace.todos_autonomous ? 'autonomous mode ON' : 'manual'}):
${todoBlock}`;
}
