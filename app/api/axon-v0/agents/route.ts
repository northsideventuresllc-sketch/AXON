import { NextResponse } from 'next/server';
import { listVentures, listAgents } from '@/lib/axon-v0/store';
import { listAgentRoutines, type AgentRoutineRow } from '@/lib/axon-v0/agent-routines';
import {
  plainPlatform,
  plainHealth,
  plainWakeType,
  plainRelativeTime,
  routineAgentStatus,
} from '@/lib/axon-v0/plain-labels';
import {
  deriveVenture,
  fetchDispatchQueue,
  fetchCompletedDispatches,
  type DispatchRow,
} from '@/lib/agent-dispatch';

// AGENTS board data. Groups the account's venture agents (axon_venture_agents,
// via the store's fail-safe layer) by venture, and overlays real task-completion
// stats derived from the agent_dispatch queue. It also overlays the fleet-wide
// agent roster (nvg_agent_routines) — the only place the Claude Code cloud agents
// and the Cowork agents being migrated actually live — grouped into one lane per
// `platform` so AXON's own agents never blend with them. Every data pull is
// wrapped so a single failing source can never 500 the page: on any error we
// return { groups: [] } (or drop just that source) with a 200 and leak no
// table/infra names to the client.
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
  /** Which fleet this agent belongs to — 'axon' for AXON's own venture agents,
   *  or a nvg_agent_routines platform value (e.g. 'claude_code_cloud'). Drives
   *  the board's lane grouping; optional so older cached responses still parse. */
  platform?: string;
}

interface GroupOut {
  ventureId: string;
  ventureName: string;
  agents: AgentOut[];
  platform?: string;
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
          platform: 'axon',
        };
        if (ownsBuilds && total > 0) {
          agentOut.tasksTotal = total;
          agentOut.tasksDone = done;
        }
        return agentOut;
      });

      return { ventureId: v.id, ventureName: v.name, agents: out, platform: 'axon' };
    });

    // Fleet-wide agent roster (Claude Code cloud + Cowork local, etc.) — one lane
    // per platform, appended alongside AXON's own venture lane. Fails independently:
    // listAgentRoutines() never throws, so a bad read here still leaves AXON's own
    // agents rendering above.
    let routines: AgentRoutineRow[] = [];
    try {
      routines = await listAgentRoutines();
    } catch {
      routines = [];
    }

    const byPlatform = new Map<string, AgentOut[]>();
    for (const r of routines) {
      const platformKey = (r.platform || 'other').toLowerCase().trim();
      const status = routineAgentStatus(r.active, r.health_status);

      const infoParts: string[] = [];
      if (r.function_summary) infoParts.push(r.function_summary);
      const lastRan = plainRelativeTime(r.last_fired_at);
      if (lastRan) infoParts.push(`Last ran ${lastRan}`);
      const healthLabel = plainHealth(r.health_status);
      if (healthLabel && status === 'blocked') infoParts.push(healthLabel);
      if (r.health_note) infoParts.push(r.health_note);

      const agentOut: AgentOut = {
        id: r.routine_id || r.agent_name,
        name: r.agent_name,
        role: plainWakeType(r.wake_type) || 'Agent',
        status,
        info: infoParts.length ? infoParts.join(' — ') : undefined,
        platform: platformKey,
      };

      const list = byPlatform.get(platformKey) ?? [];
      list.push(agentOut);
      byPlatform.set(platformKey, list);
    }

    for (const [platformKey, agentsOut] of byPlatform) {
      groups.push({
        ventureId: `platform:${platformKey}`,
        ventureName: plainPlatform(platformKey),
        agents: agentsOut,
        platform: platformKey,
      });
    }

    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ groups: [] });
  }
}
