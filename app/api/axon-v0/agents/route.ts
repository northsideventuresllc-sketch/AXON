import { NextResponse } from 'next/server';
import { listVentures, listAgents } from '@/lib/axon-v0/store';
import {
  deriveVenture,
  fetchDispatchQueue,
  fetchCompletedDispatches,
  type DispatchRow,
} from '@/lib/agent-dispatch';

// AGENTS board data. Groups the account's venture agents (axon_venture_agents,
// via the store's fail-safe layer) by venture, and overlays real task-completion
// stats derived from the agent_dispatch queue. Every data pull is wrapped so a
// single failing source can never 500 the page: on any error we return
// { groups: [] } with a 200 and leak no table/infra names to the client.
export const dynamic = 'force-dynamic';

type AgentStatus = 'running' | 'blocked' | 'active' | 'idle';

interface AgentOut {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  tasksDone?: number;
  tasksTotal?: number;
  info?: string;
}

interface GroupOut {
  ventureId: string;
  ventureName: string;
  agents: AgentOut[];
}

const DONE = new Set(['done', 'skipped']);
const RUNNING = new Set(['running']);
const BLOCKED = new Set(['blocked', 'failed']);

/** Loose venture matcher: shared significant token between the store venture
 *  name and the venture label agent_dispatch derives from repo/owner/code. */
function ventureMatches(storeName: string, dispatchLabel: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((t) => t.length > 2);
  const a = new Set(norm(storeName));
  for (const t of norm(dispatchLabel)) {
    if (a.has(t)) return true;
  }
  return false;
}

export async function GET() {
  try {
    let ventures: Awaited<ReturnType<typeof listVentures>> = [];
    let agents: Awaited<ReturnType<typeof listAgents>> = [];
    try {
      ventures = await listVentures();
    } catch {
      ventures = [];
    }
    try {
      agents = await listAgents();
    } catch {
      agents = [];
    }

    // Real dispatch tasks (queue + recent completed), venture-tagged.
    let dispatch: DispatchRow[] = [];
    try {
      const [queued, completed] = await Promise.all([
        fetchDispatchQueue(200).catch(() => []),
        fetchCompletedDispatches(200).catch(() => []),
      ]);
      const seen = new Set<string>();
      dispatch = [...queued, ...completed].filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    } catch {
      dispatch = [];
    }

    const groups: GroupOut[] = ventures.map((v) => {
      const rows = dispatch.filter((r) => ventureMatches(v.name, deriveVenture(r)));
      const total = rows.length;
      const done = rows.filter((r) => DONE.has((r.status || '').toLowerCase())).length;
      const anyRunning = rows.some((r) => RUNNING.has((r.status || '').toLowerCase()));
      const anyBlocked = rows.some((r) => BLOCKED.has((r.status || '').toLowerCase()));

      const ventureAgents = agents.filter((a) => a.venture_id === v.id);

      const out: AgentOut[] = ventureAgents.map((a) => {
        // Build/dispatch work is owned by the build_manager; it carries the
        // venture's task rollup. Other roles surface a status only.
        const ownsBuilds = a.role === 'build_manager';
        let status: AgentStatus = 'idle';
        if (ownsBuilds) {
          if (anyBlocked) status = 'blocked';
          else if (anyRunning) status = 'running';
          else if (total > 0) status = 'active';
        } else {
          status = total > 0 ? 'active' : 'idle';
        }
        const agentOut: AgentOut = {
          id: a.id,
          name: a.name,
          role: a.role,
          status,
          info: a.description || undefined,
        };
        if (ownsBuilds && total > 0) {
          agentOut.tasksTotal = total;
          agentOut.tasksDone = done;
        }
        return agentOut;
      });

      return { ventureId: v.id, ventureName: v.name, agents: out };
    });

    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ groups: [] });
  }
}
