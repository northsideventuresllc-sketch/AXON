// AXON v0 data layer. Reads/writes the axon-v0 tables when they exist;
// until the staged migration (db/axon-v0/001) is approved and applied, it
// falls back to an in-process seeded store so the whole slice still runs.
import { createSupabaseClient } from '@/lib/supabase.mjs';
import {
  AgentMessage,
  AgentModelAssignment,
  DEFAULT_AGENTS,
  ModelProvider,
  Venture,
  VentureAgent,
  VentureTool,
} from './types';

// Last-resort fallback only. This id matches NO row in axon_accounts and never did.
// Every account-scoped query must go through accountId() below — filtering on this
// constant against live tables returns ZERO rows, which is worse than the in-memory
// fallback it replaced. Found by an independent verifier 2026-08-28 after the first
// pass fixed only 3 of the 10 account-scoped functions.
const ACCOUNT_ID_FALLBACK = '00000000-0000-0000-0000-000000000001';

/** The real account id, resolved by operator email. Falls back only if no row exists. */
async function accountId(): Promise<string> {
  return (await getAccount())?.id ?? ACCOUNT_ID_FALLBACK;
}

function sb() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createSupabaseClient(key) as {
    sbSelect: (t: string, f?: string) => Promise<any[]>;
    sbInsert: (t: string, r: unknown) => Promise<any>;
    sbPatch: (t: string, f: string, r: unknown) => Promise<any>;
    sbDelete: (t: string, f: string) => Promise<any[]>;
  };
}

// ---------- in-memory fallback (pre-migration) ----------
interface MemStore {
  ventures: Venture[];
  agents: VentureAgent[];
  messages: AgentMessage[];
  providers: Array<ModelProvider & { api_key: string | null }>;
  assignments: AgentModelAssignment[];
  ventureTools: VentureTool[];
  seeded: boolean;
}
const g = globalThis as unknown as { __axonV0Mem?: MemStore };
function mem(): MemStore {
  if (!g.__axonV0Mem) {
    g.__axonV0Mem = {
      ventures: [],
      agents: [],
      messages: [],
      providers: [],
      assignments: [],
      ventureTools: [],
      seeded: false,
    };
  }
  return g.__axonV0Mem;
}
const uid = () => crypto.randomUUID();

function seedMem() {
  const m = mem();
  if (m.seeded) return;
  m.seeded = true;
  const seedVentures: Array<[string, string, string]> = [
    ['Northside Intelligence', 'AI tools & services', '#00D4FF'],
    ['Match Fit', 'Athlete resume & recruiting', '#38F2A8'],
    ['AXON', 'The harness itself', '#8AB4FF'],
    ['North-Stars Foundation', 'Nonprofit', '#F2C14E'],
  ];
  seedVentures.forEach(([name, tagline, accent], i) => {
    const v: Venture = { id: uid(), name, tagline, accent, sort_order: i, settings: {}, parent_id: null };
    m.ventures.push(v);
    for (const a of DEFAULT_AGENTS) {
      m.agents.push({
        id: uid(),
        venture_id: v.id,
        role: a.role,
        name: a.name,
        description: a.description,
        is_template: false,
        config: {},
      });
    }
  });
}

async function tableLive(table: string): Promise<boolean> {
  try {
    await sb().sbSelect(table, 'limit=1');
    return true;
  } catch {
    return false;
  }
}

// ---------- ventures ----------
export async function listVentures(): Promise<Venture[]> {
  if (await tableLive('axon_ventures')) {
    const rows: Venture[] = await sb().sbSelect(
      'axon_ventures',
      `account_id=eq.${await accountId()}&order=sort_order.asc`
    );
    return orderByHierarchy(rows);
  }
  seedMem();
  return mem().ventures;
}

/**
 * Flat list, but each sub-venture sits immediately after its parent.
 *
 * Without this a sub-venture sorts by its own sort_order and lands anywhere — the swim
 * school appeared as a seventh top-level room rather than under the Foundation. Callers
 * that understand nesting should use `parent_id`; this ordering keeps the ones that don't
 * from showing something misleading.
 */
export function orderByHierarchy(rows: Venture[]): Venture[] {
  const tops = rows.filter((v) => !v.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenOf = (id: string) =>
    rows.filter((v) => v.parent_id === id).sort((a, b) => a.sort_order - b.sort_order);
  const out: Venture[] = [];
  for (const top of tops) {
    out.push(top);
    out.push(...childrenOf(top.id));
  }
  // Any child whose parent is missing or filtered out still has to appear somewhere.
  for (const row of rows) if (!out.includes(row)) out.push(row);
  return out;
}

export async function createVenture(name: string, tagline?: string, accent?: string, parentId?: string | null): Promise<Venture> {
  const existing = await listVentures();
  if (await tableLive('axon_ventures')) {
    const v = await sb().sbInsert('axon_ventures', {
      account_id: await accountId(),
      name,
      tagline: tagline || null,
      accent: accent || '#00D4FF',
      sort_order: existing.length,
      parent_id: parentId || null,
    });
    for (const a of DEFAULT_AGENTS) {
      await sb().sbInsert('axon_venture_agents', {
        account_id: await accountId(),
        venture_id: v.id,
        role: a.role,
        name: a.name,
        description: a.description,
      });
    }
    return v;
  }
  seedMem();
  const v: Venture = {
    id: uid(),
    name,
    tagline: tagline || null,
    accent: accent || '#00D4FF',
    sort_order: existing.length,
    settings: {},
    parent_id: parentId || null,
  };
  mem().ventures.push(v);
  for (const a of DEFAULT_AGENTS) {
    mem().agents.push({
      id: uid(),
      venture_id: v.id,
      role: a.role,
      name: a.name,
      description: a.description,
      is_template: false,
      config: {},
    });
  }
  return v;
}

// ---------- agents ----------
export async function listAgents(ventureId?: string): Promise<VentureAgent[]> {
  if (await tableLive('axon_venture_agents')) {
    const f = ventureId ? `&venture_id=eq.${ventureId}` : '';
    return sb().sbSelect('axon_venture_agents', `account_id=eq.${await accountId()}${f}&order=created_at.asc`);
  }
  seedMem();
  return mem().agents.filter((a) => !ventureId || a.venture_id === ventureId);
}

// ---------- messages (one account-wide bus) ----------
export async function listMessages(ventureId: string, thread = 'group', limit = 80): Promise<AgentMessage[]> {
  if (await tableLive('axon_agent_messages')) {
    return sb().sbSelect(
      'axon_agent_messages',
      `account_id=eq.${await accountId()}&venture_id=eq.${ventureId}&thread=eq.${thread}&order=created_at.asc&limit=${limit}`
    );
  }
  seedMem();
  return mem()
    .messages.filter((msg) => msg.venture_id === ventureId && msg.thread === thread)
    .slice(-limit);
}

export async function addMessage(
  msg: Omit<AgentMessage, 'id' | 'created_at'>
): Promise<AgentMessage> {
  if (await tableLive('axon_agent_messages')) {
    return sb().sbInsert('axon_agent_messages', { account_id: await accountId(), ...msg });
  }
  seedMem();
  const full: AgentMessage = { id: uid(), created_at: new Date().toISOString(), ...msg };
  mem().messages.push(full);
  return full;
}

export interface ThreadSummary {
  thread: string;
  title: string;
  last_message_at: string;
  last_sender: string;
}

/**
 * One row per distinct `thread` value in this venture, newest activity first. Title is the
 * first user message on that thread (truncated) so a saved chat reads as what it was about,
 * not a raw thread id. PostgREST has no cheap "distinct" here, so this pulls every message
 * for the venture (already capped by venture scope + account scope) and groups it in memory —
 * fine at v0 volume, matches the in-memory fallback's own no-index approach.
 */
export async function listThreads(ventureId: string): Promise<ThreadSummary[]> {
  const TITLE_MAX = 60;
  const titleFrom = (content: string) =>
    content.length > TITLE_MAX ? `${content.slice(0, TITLE_MAX).trimEnd()}…` : content;

  let rows: AgentMessage[];
  if (await tableLive('axon_agent_messages')) {
    rows = await sb().sbSelect(
      'axon_agent_messages',
      `account_id=eq.${await accountId()}&venture_id=eq.${ventureId}&order=created_at.asc&select=id,thread,sender,content,created_at`
    );
  } else {
    seedMem();
    rows = mem().messages.filter((msg) => msg.venture_id === ventureId);
  }

  const byThread = new Map<string, { title: string | null; last_message_at: string; last_sender: string }>();
  for (const row of rows) {
    const entry = byThread.get(row.thread);
    const title = entry?.title ?? (row.sender === 'user' ? titleFrom(row.content.trim()) : null);
    byThread.set(row.thread, {
      title,
      last_message_at: row.created_at,
      last_sender: row.sender,
    });
  }

  return Array.from(byThread.entries())
    .map(([thread, v]) => ({
      thread,
      title: v.title || (thread === 'group' ? 'Venture room' : 'New chat'),
      last_message_at: v.last_message_at,
      last_sender: v.last_sender,
    }))
    .sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
}

// Cross-venture context: recent group-chat lines from other ventures, so any
// agent can reference what's happening account-wide ("everything connected").
export async function crossVentureContext(excludeVentureId: string, limit = 12): Promise<string> {
  const ventures = await listVentures();
  const lines: string[] = [];
  for (const v of ventures) {
    if (v.id === excludeVentureId) continue;
    const msgs = await listMessages(v.id, 'group', 3);
    for (const msg of msgs) lines.push(`[${v.name}] ${msg.sender}: ${msg.content.slice(0, 160)}`);
  }
  return lines.slice(-limit).join('\n');
}

// ---------- account ----------
/** Service-role key, for callers that hand it to the router core directly. */
export function supabaseKey(): string {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

let accountCache: { id: string; has_mini_access: boolean } | null = null;

/**
 * The real account row. ACCOUNT_ID above was a placeholder that never matched a live row —
 * resolving by the operator email is what actually finds it.
 */
export async function getAccount(): Promise<{ id: string; has_mini_access: boolean } | null> {
  if (accountCache) return accountCache;
  if (!(await tableLive('axon_accounts'))) return null;
  const email = process.env.AXON_OPERATOR_EMAIL || 'northside.ventures.llc@gmail.com';
  const rows = await sb().sbSelect('axon_accounts', `ni_email=eq.${encodeURIComponent(email)}&limit=1`);
  const row = rows[0];
  if (!row) return null;
  accountCache = { id: row.id, has_mini_access: !!row.has_mini_access };
  return accountCache;
}

// ---------- connectors / lanes / assignments ----------
// Providers live in router_routes x router_models (the "lanes"), joined to this account's
// axon_account_connectors. The old axon_model_providers table was dropped before it was ever
// created — it duplicated router_routes and stored a raw api_key where router_routes stores
// a secret_key NAME pointing at ni_platform_secrets.

/** Every lane this account can use, newest catalog state, in the operator's own order. */
export async function listProviders(): Promise<ModelProvider[]> {
  if (await tableLive('router_models')) {
    const account = await getAccount();
    const [routes, models, connectors] = await Promise.all([
      sb().sbSelect('router_routes', 'select=*'),
      sb().sbSelect('router_models', 'select=*&order=cost_tier.asc,priority.asc'),
      account
        ? sb().sbSelect('axon_account_connectors', `account_id=eq.${account.id}`)
        : Promise.resolve([] as any[]),
    ]);
    const routeById = new Map(routes.map((r: any) => [r.id, r]));
    const connByRoute = new Map(connectors.map((c: any) => [c.route_id, c]));
    return models
      .map((m: any) => {
        const route: any = routeById.get(m.route_id);
        if (!route) return null;
        const conn: any = connByRoute.get(route.id);
        return {
          id: m.id,
          label: `${route.name} · ${m.model}`,
          kind: route.connector_kind || route.kind,
          base_url: route.base_url,
          model: m.model,
          // A subscription lane's "key" is a signed-in CLI, not a secret.
          has_key: route.connector_kind === 'subscription'
            ? conn?.status === 'connected'
            : Boolean(route.secret_key),
        } as ModelProvider;
      })
      .filter(Boolean) as ModelProvider[];
  }
  seedMem();
  return mem().providers.map(({ api_key, ...p }) => ({ ...p, has_key: Boolean(api_key) }));
}

/**
 * Add a custom lane (a self-hosted Ollama, or any OpenAI-compatible endpoint). Scoped to
 * this account so it never pollutes the global catalog. Keys are stored by NAME only.
 */
export async function addProvider(input: {
  label: string;
  kind: ModelProvider['kind'];
  base_url?: string;
  model: string;
  secret_key?: string;
}): Promise<ModelProvider> {
  if (await tableLive('router_models')) {
    const account = await getAccount();
    const route = await sb().sbInsert('router_routes', {
      name: `${input.label}-${Date.now()}`,
      kind: input.kind === 'ollama' ? 'local' : 'api',
      connector_kind: input.kind === 'ollama' ? 'local' : 'api',
      base_url: input.base_url || null,
      secret_key: input.secret_key || null,
      account_id: account?.id ?? null,
      enabled: true,
    });
    const lane = await sb().sbInsert('router_models', {
      route_id: route.id,
      model: input.model,
      tier_rank: 3,
      priority: 50,
      enabled: true,
      cost_tier: input.kind === 'ollama' ? 0 : 2,
    });
    if (account) {
      await sb().sbInsert('axon_account_connectors', {
        account_id: account.id,
        route_id: route.id,
        connector_kind: route.connector_kind,
        status: 'connected',
        secret_key: input.secret_key || null,
      });
    }
    return {
      id: lane.id,
      label: input.label,
      kind: input.kind,
      base_url: input.base_url || null,
      model: input.model,
      has_key: Boolean(input.secret_key),
    };
  }
  seedMem();
  const p = {
    id: uid(),
    label: input.label,
    kind: input.kind,
    base_url: input.base_url || null,
    model: input.model,
    api_key: input.secret_key || null,
    has_key: Boolean(input.secret_key),
  };
  mem().providers.push(p);
  const { api_key, ...pub } = p;
  return pub;
}

export async function getAssignment(agentId: string): Promise<AgentModelAssignment | null> {
  if (await tableLive('axon_agent_model_assignments')) {
    const rows = await sb().sbSelect('axon_agent_model_assignments', `agent_id=eq.${agentId}&limit=1`);
    return rows[0] || null;
  }
  return mem().assignments.find((a) => a.agent_id === agentId) || null;
}

/** Every agent's current assignment, for a single hydrating fetch instead of one call per agent. */
export async function listAssignments(): Promise<AgentModelAssignment[]> {
  if (await tableLive('axon_agent_model_assignments')) {
    return sb().sbSelect('axon_agent_model_assignments', 'select=*');
  }
  return mem().assignments;
}

export async function setAssignment(a: AgentModelAssignment): Promise<void> {
  if (await tableLive('axon_agent_model_assignments')) {
    const account = await getAccount();
    const existing = await getAssignment(a.agent_id);
    if (existing) {
      await sb().sbPatch('axon_agent_model_assignments', `agent_id=eq.${a.agent_id}`, {
        mode: a.mode,
        lane_id: a.lane_id ?? null,
        updated_at: new Date().toISOString(),
      });
    } else {
      await sb().sbInsert('axon_agent_model_assignments', {
        account_id: await accountId(),
        agent_id: a.agent_id,
        mode: a.mode,
        lane_id: a.lane_id ?? null,
      });
    }
    return;
  }
  const m = mem();
  m.assignments = m.assignments.filter((x) => x.agent_id !== a.agent_id).concat(a);
}

// ---------- per-venture tools ----------
export async function listVentureTools(ventureId: string): Promise<VentureTool[]> {
  if (await tableLive('axon_venture_tools')) {
    return sb().sbSelect('axon_venture_tools', `account_id=eq.${await accountId()}&venture_id=eq.${ventureId}`);
  }
  seedMem();
  return mem().ventureTools.filter((t) => t.venture_id === ventureId);
}

export async function assignVentureTool(input: {
  venture_id: string;
  tool_slug: string;
  display_name?: string;
  notes?: string;
}): Promise<VentureTool> {
  if (await tableLive('axon_venture_tools')) {
    return sb().sbInsert('axon_venture_tools', { account_id: await accountId(), config: {}, ...input });
  }
  seedMem();
  const t: VentureTool = {
    id: uid(),
    venture_id: input.venture_id,
    tool_slug: input.tool_slug,
    display_name: input.display_name || null,
    notes: input.notes || null,
    config: {},
  };
  mem().ventureTools = mem().ventureTools.filter(
    (x) => !(x.venture_id === t.venture_id && x.tool_slug === t.tool_slug)
  );
  mem().ventureTools.push(t);
  return t;
}
