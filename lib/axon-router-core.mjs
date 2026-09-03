/**
 * AXON Omni Router — the single routing core.
 *
 * Replaces three overlapping implementations: lib/axon-v0/omni-router.ts (per-agent fixed
 * routing), lib/ai.mjs callTiered() and lib/axon-web-chat.ts callChatModel() (two near-copies
 * of the same blind waterfall). All three now call routeChat().
 *
 * Plain .mjs on purpose: the GitHub Actions scripts run raw `node` with no TS loader, which
 * is exactly why lib/axon-fire-gate-core.mjs exists alongside its .ts wrapper. Same pattern
 * here — lib/axon-router.ts is a thin re-export.
 *
 * Lane definitions, capabilities, costs and health all live in NI-Brain
 * (router_routes / router_models / router_health / axon_account_connectors). Nothing about
 * which model to use is hardcoded in this file.
 */

import { queueMiniShellJob } from './nvg-mini-queue.mjs';
import { callSubscriptionCli } from './axon-subscription-cli.mjs';
import { buildAgentBootContext } from './axon-agent-boot.mjs';
import { handleToolCall } from './axon-agent-bus.mjs';
import { getAccountKey } from './axon-account-keys.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

// Matches ACCOUNT_ID_FALLBACK in lib/axon-v0/store.ts — the platform account's default
// chain lives under this id so a fresh account with no axon_llm_chain rows of its own still
// gets the locked default order below instead of routing to nothing.
export const PLATFORM_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

/** The fixed capability vocabulary. Stored in router_models.capabilities. */
export const CAPABILITY_CLASSES = [
  'cheap_chat',
  'long_context',
  'code_build',
  'reasoning_planning',
  'vision',
  'tool_use_agentic',
  'computer_use',
];

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function sbGet(key, path) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...hdrs(key), Accept: 'application/json' },
    });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

async function sbPost(key, table, row, prefer = 'return=minimal') {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...hdrs(key), Prefer: prefer },
      body: JSON.stringify(row),
    });
    if (!r.ok) return null;
    return prefer.includes('representation') ? await r.json() : true;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Capability classification
// ---------------------------------------------------------------------------

const CODE_HINT = /```|\bdiff\b|\bstack trace\b|\btypescript\b|\bnpm run\b|\bmigration\b|\bPR #|\bcompile|\blint\b/i;
const PLAN_HINT = /\bwhy\b|\btrade-?off|\bstrategy\b|\bdecide\b|\bcompare\b|\bplan\b|\barchitect/i;

/**
 * Deterministic first, model call only as a last resort — and that call is pinned to a
 * free lane so classification can never recurse into scoring.
 */
export async function classifyCapability(supabaseKey, opts = {}) {
  const { userMessage = '', agentRole = '', hasImages = false, isComputerUse = false, historyLength = 0 } = opts;
  if (isComputerUse) return 'computer_use';
  if (hasImages) return 'vision';
  if (agentRole.startsWith('build_') || agentRole === 'build_manager' || CODE_HINT.test(userMessage)) {
    return 'code_build';
  }
  if (userMessage.length > 8000 || historyLength > 40) return 'long_context';
  if (agentRole === 'council' || agentRole === 'exec_assistant' || PLAN_HINT.test(userMessage)) {
    return 'reasoning_planning';
  }
  return 'cheap_chat';
}

// ---------------------------------------------------------------------------
// 2. Candidate lanes
// ---------------------------------------------------------------------------

/**
 * Joins the global lane catalog to this account's connected connectors and current health.
 * A lane is only a candidate if its route is enabled, its model is enabled, and the account
 * has an enabled connector for it.
 */
export async function listCandidateLanes(supabaseKey, { accountId } = {}) {
  const [routes, models, health, connectors] = await Promise.all([
    sbGet(supabaseKey, 'router_routes?select=*'),
    sbGet(supabaseKey, 'router_models?select=*'),
    sbGet(supabaseKey, 'router_health?select=*'),
    accountId
      ? sbGet(supabaseKey, `axon_account_connectors?select=*&account_id=eq.${accountId}`)
      : Promise.resolve([]),
  ]);

  const routeById = new Map(routes.map((r) => [r.id, r]));
  const connByRoute = new Map(connectors.map((c) => [c.route_id, c]));
  const healthFor = (routeId, model) =>
    health.find((h) => h.route_id === routeId && (h.model === model || h.model == null)) || null;

  const lanes = [];
  for (const m of models) {
    if (m.enabled === false) continue;
    const route = routeById.get(m.route_id);
    if (!route || route.enabled === false) continue;
    // When the account has any connectors configured, respect them. When it has none
    // (a fresh account, or a raw script call), fall open to the global catalog rather
    // than routing to nothing.
    const conn = connByRoute.get(route.id);
    if (connectors.length > 0) {
      if (!conn || conn.enabled === false) continue;
      if (conn.status === 'error' || conn.status === 'needs_reauth') continue;
    }
    lanes.push({
      laneId: m.id,
      model: m.model,
      route,
      connectorKind: route.connector_kind || route.kind || 'api',
      capabilities: m.capabilities || [],
      costTier: m.cost_tier ?? 3,
      isSafetyNet: !!m.is_safety_net,
      priority: m.priority ?? 10,
      quotaRef: m.quota_ref || null,
      sortOrder: conn?.sort_order ?? 999,
      health: healthFor(route.id, m.model),
    });
  }
  return lanes;
}

// ---------------------------------------------------------------------------
// 3. Scoring — PURE. No I/O. Unit-testable. Deterministic.
// ---------------------------------------------------------------------------

const COST_SCORE = { 0: 1.0, 1: 0.7, 2: 0.4, 3: 0.15 };

function healthScore(h) {
  if (!h) return 1.0; // never seen — optimistic
  if (h.status === 'circuit_open') {
    // Only excluded while the breaker is actually still open.
    if (h.retry_after && new Date(h.retry_after).getTime() > Date.now()) return null;
    return 0.5;
  }
  if (h.status === 'degraded') return 0.5;
  return 1.0;
}

/**
 * @param {Array} lanes from listCandidateLanes
 * @param {{capabilityClass: string, quota?: Record<string, number>, costTierFloor?: number|null}} ctx
 *   costTierFloor: when set, lanes with costTier below it are excluded — the operator's
 *   manual power-bar lock (see PowerModePrefs / POWER_LEVEL_TO_COST_TIER_FLOOR in
 *   lib/axon-types.ts), not applied when auto power switching is on.
 * @returns {Array} ranked [{lane, score, reasons[]}], best first
 */
export function scoreLanes(lanes, { capabilityClass, quota = {}, costTierFloor = null } = {}) {
  const scored = [];
  for (const lane of lanes) {
    const reasons = [];

    let fit;
    if (lane.capabilities.includes(capabilityClass)) {
      fit = 1.0;
      reasons.push(`capability match: ${capabilityClass}`);
    } else if (lane.capabilities.length === 0) {
      fit = 0.4;
      reasons.push('general lane, capabilities unclassified');
    } else {
      continue; // hard filter — not a penalty
    }

    if (costTierFloor != null && lane.costTier < costTierFloor) continue; // below the operator's power-bar lock

    const hs = healthScore(lane.health);
    if (hs === null) continue; // circuit open, still inside its backoff
    reasons.push(`health: ${lane.health?.status || 'unknown'}`);

    const cs = COST_SCORE[lane.costTier] ?? 0.15;
    reasons.push(
      lane.costTier === 0
        ? `free (${lane.connectorKind === 'subscription' ? 'subscription already paid for' : lane.connectorKind})`
        : `metered, cost tier ${lane.costTier}`,
    );

    const qs = lane.quotaRef && typeof quota[lane.quotaRef] === 'number'
      ? Math.max(0.05, quota[lane.quotaRef])
      : 1.0;
    if (qs < 1.0) reasons.push(`quota remaining ~${Math.round(qs * 100)}%`);

    if (lane.isSafetyNet) reasons.push('paid safety net — sorts last by design');

    scored.push({
      lane,
      score: fit * (0.45 * cs + 0.35 * hs + 0.2 * qs),
      reasons,
    });
  }

  // Tie-breaks, in order: cheaper first, safety-net last, then the stable priority column
  // so identical health state always yields the identical pick.
  scored.sort((a, b) =>
    b.score - a.score ||
    a.lane.costTier - b.lane.costTier ||
    Number(a.lane.isSafetyNet) - Number(b.lane.isSafetyNet) ||
    a.lane.sortOrder - b.lane.sortOrder ||
    a.lane.priority - b.lane.priority,
  );
  return scored;
}

// ---------------------------------------------------------------------------
// 4. Provider calls — bodies lifted from lib/axon-v0/omni-router.ts
// ---------------------------------------------------------------------------

async function callOpenAICompatible(baseUrl, apiKey, model, messages) {
  const r = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, messages, max_tokens: 1024 }),
  });
  if (!r.ok) throw new Error(`provider HTTP ${r.status}`);
  const text = (await r.json())?.choices?.[0]?.message?.content;
  if (!text) throw new Error('provider returned no content');
  return text;
}

async function callAnthropic(apiKey, model, messages) {
  const system = messages.find((m) => m.role === 'system')?.content;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: messages.filter((m) => m.role !== 'system'),
    }),
  });
  if (!r.ok) throw new Error(`anthropic HTTP ${r.status}`);
  const text = (await r.json())?.content?.[0]?.text;
  if (!text) throw new Error('anthropic returned no content');
  return text;
}

async function callGemini(apiKey, model, messages) {
  const system = messages.find((m) => m.role === 'system')?.content;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}) }),
    },
  );
  if (!r.ok) throw new Error(`gemini HTTP ${r.status}`);
  const text = (await r.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('gemini returned no content');
  return text;
}

/** Secrets are read by NAME from ni_platform_secrets. Values never leave the server. */
async function loadSecret(supabaseKey, keyName) {
  if (!keyName) return null;
  if (process.env[keyName]) return process.env[keyName]; // env wins, per repo convention
  const rows = await sbGet(supabaseKey, `ni_platform_secrets?select=value&key=eq.${encodeURIComponent(keyName)}`);
  return rows?.[0]?.value || null;
}

// ---------------------------------------------------------------------------
// 5. Health / circuit breaker — this table has been modelled all along and never written to
// ---------------------------------------------------------------------------

async function recordHealth(supabaseKey, lane, ok, reason) {
  const existing = await sbGet(
    supabaseKey,
    `router_health?select=*&route_id=eq.${lane.route.id}&model=eq.${encodeURIComponent(lane.model)}`,
  );
  const row = existing?.[0];
  const failures = ok ? 0 : (row?.failure_count ?? 0) + 1;
  const backoff = ok ? 0 : Math.min(2 ** Math.min(failures, 8) * 15, 3600);
  const patch = {
    route_id: lane.route.id,
    model: lane.model,
    status: ok ? 'healthy' : failures >= 3 ? 'circuit_open' : 'degraded',
    reason: ok ? null : String(reason).slice(0, 400),
    failure_count: failures,
    backoff_seconds: backoff,
    retry_after: ok ? null : new Date(Date.now() + backoff * 1000).toISOString(),
    ...(ok ? { last_success_at: new Date().toISOString() } : { last_failure_at: new Date().toISOString() }),
    updated_at: new Date().toISOString(),
  };
  try {
    if (row) {
      await fetch(`${SUPABASE_URL}/rest/v1/router_health?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: hdrs(supabaseKey),
        body: JSON.stringify(patch),
      });
    } else {
      await sbPost(supabaseKey, 'router_health', patch);
    }
  } catch {
    // health bookkeeping must never break a live reply
  }
}

export async function recordUsage(supabaseKey, { lane, venture, product, tokensIn, tokensOut, costUsd }) {
  await sbPost(supabaseKey, 'axon_cost_ledger', {
    venture: venture || null,
    product: product || null,
    model: lane?.model || null,
    tier: lane?.costTier ?? null,
    executor: lane?.connectorKind || null,
    input_tokens: tokensIn ?? null,
    output_tokens: tokensOut ?? null,
    total_tokens: (tokensIn ?? 0) + (tokensOut ?? 0) || null,
    cost_usd: costUsd ?? null,
    called_at: new Date().toISOString(),
  });
}

/**
 * recordLlmUsage — the one door every non-Claude LLM caller logs through (Phase A3,
 * agentic-os-phase2-harness-usage.md). Dependency-free (no imports beyond fetch, which this
 * file already relies on) so matchfit/NI/nv-vault scripts can copy or import it without
 * pulling in the rest of the router. Never throws — usage logging must not break a live call.
 *
 * @param {string} supabaseKey - NI-Brain service role or anon key with insert on axon_cost_ledger
 * @param {object} usage
 * @param {string} [usage.agentName] - env AGENT_NAME or caller identity, e.g. "matchfit-ai-vault"
 * @param {string} [usage.provider] - 'ollama' | 'runpod' | 'gemini' | 'gemini_backup' | 'anthropic'
 * @param {string} [usage.model]
 * @param {number} [usage.tokensIn]
 * @param {number} [usage.tokensOut]
 * @param {number} [usage.costUsd]
 * @param {number} [usage.ms] - wall-clock latency of the call in milliseconds
 * @param {string} [usage.venture]
 * @param {string} [usage.product]
 * @param {object} [usage.meta] - free-form extra context, folded into `notes` as JSON (best-effort)
 * @returns {Promise<boolean>} true if the row was written, false if logging failed (call still succeeded)
 */
export async function recordLlmUsage(
  supabaseKey,
  { agentName, provider, model, tokensIn, tokensOut, costUsd, ms, venture, product, meta } = {},
) {
  if (!supabaseKey) return false;
  const tokensInN = Number.isFinite(tokensIn) ? tokensIn : null;
  const tokensOutN = Number.isFinite(tokensOut) ? tokensOut : null;
  const totalTokens =
    tokensInN != null || tokensOutN != null ? (tokensInN ?? 0) + (tokensOutN ?? 0) : null;
  let notes = null;
  if (meta) {
    try {
      notes = JSON.stringify(meta).slice(0, 2000);
    } catch {
      notes = null;
    }
  }
  const row = await sbPost(supabaseKey, 'axon_cost_ledger', {
    venture: venture || null,
    product: product || null,
    model: model || null,
    executor: provider || null,
    provider: provider || null,
    agent_name: agentName || null,
    input_tokens: tokensInN,
    output_tokens: tokensOutN,
    total_tokens: totalTokens,
    cost_usd: Number.isFinite(costUsd) ? costUsd : null,
    ms: Number.isFinite(ms) ? ms : null,
    notes,
    called_at: new Date().toISOString(),
  });
  return row !== null;
}

// ---------------------------------------------------------------------------
// 6. Lane execution
// ---------------------------------------------------------------------------

/**
 * @returns {Promise<{reply: string}|{unavailable: true, reason: string}>}
 * @throws on provider failure, so routeChat can trip the breaker and fall through
 */
export async function executeLane(supabaseKey, lane, messages, { hasMini = false } = {}) {
  const system = messages.find((m) => m.role === 'system')?.content || '';

  if (lane.connectorKind === 'subscription') {
    const out = await callSubscriptionCli(supabaseKey, {
      cliCommand: lane.route.cli_command,
      system,
      messages,
      hasMini,
    });
    if (out && out.unavailable) return out;
    if (!out?.reply) throw new Error('subscription CLI returned nothing');
    return { reply: out.reply };
  }

  if (lane.connectorKind === 'local') {
    const prompt = `${system}\n\n${messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n')}\nAssistant:`;
    // think:false is required — axon-ornith is a thinking-capable model that otherwise puts
    // its whole answer in `thinking` and leaves `response` empty (Learning #3625, 2026-08-05).
    const body = JSON.stringify({ model: lane.model, prompt, stream: false, think: false });
    const base = lane.route.base_url || 'http://localhost:11434';
    const stdout = await queueMiniShellJob(
      supabaseKey,
      `curl -s -m 40 ${base}/api/generate -d ${JSON.stringify(body)}`,
      { title: `axon-local-${lane.model}` },
    );
    if (!stdout) throw new Error('local lane: no response from the mini');
    const text = JSON.parse(stdout)?.response?.trim();
    if (!text) throw new Error('local lane: empty response');
    return { reply: text };
  }

  // api
  const apiKey = await loadSecret(supabaseKey, lane.route.secret_key);
  const host = (lane.route.base_url || '').toLowerCase();
  if (host.includes('anthropic') || lane.route.name === 'anthropic-api') {
    if (!apiKey) throw new Error('anthropic lane: no key');
    return { reply: await callAnthropic(apiKey, lane.model, messages) };
  }
  if (lane.route.name.startsWith('gemini') || host.includes('googleapis')) {
    if (!apiKey) throw new Error('gemini lane: no key');
    return { reply: await callGemini(apiKey, lane.model, messages) };
  }
  return {
    reply: await callOpenAICompatible(lane.route.base_url || 'https://api.openai.com/v1', apiKey, lane.model, messages),
  };
}

// ---------------------------------------------------------------------------
// 6b. axonGenerate — the ONE locked default LLM chain (Decision #1721).
//
// local (Mac mini Ollama, via nvg_mini_jobs relay) -> RunPod AXON v1 -> OpenRouter FREE ->
// Gemini Flash (free) -> Anthropic Claude (paid, last resort). Separate from routeChat's
// capability-scored lane machinery on purpose: that system ranks many possible lanes
// (subscriptions included) per capability class; this is the one fixed order plain text
// generation always walks, which any account can reorder/enable/disable and override with
// its own provider keys (axon_account_provider_keys, never the platform's ni_platform_secrets
// values). Every attempt — success or failure — is logged via recordLlmUsage so the chain is
// auditable from axon_cost_ledger alone.
// ---------------------------------------------------------------------------

/** The locked default order when an account has no axon_llm_chain rows of its own. */
export const DEFAULT_LLM_CHAIN = ['local', 'runpod', 'openrouter', 'gemini', 'anthropic'];

const TIER_ROUTE_NAME = {
  local: 'ollama-local',
  runpod: 'runpod-axon-v1',
  openrouter: 'openrouter',
  gemini: 'gemini-api',
  anthropic: 'anthropic-api',
};

/** Provider name as stored in axon_account_provider_keys. 'local' has no key — it's a relay. */
const TIER_KEY_PROVIDER = { runpod: 'runpod', openrouter: 'openrouter', gemini: 'gemini', anthropic: 'anthropic' };

/** Loads the account's chain rows, falling back to the platform account's rows, falling
 *  back to DEFAULT_LLM_CHAIN — an account (or a bare script call with no accountId) is
 *  never stranded with zero tiers to try. */
async function loadLlmChain(supabaseKey, accountId) {
  if (accountId) {
    const rows = await sbGet(
      supabaseKey,
      `axon_llm_chain?select=*&account_id=eq.${accountId}&order=position.asc`,
    );
    if (rows?.length) return rows;
  }
  if (accountId !== PLATFORM_ACCOUNT_ID) {
    const platformRows = await sbGet(
      supabaseKey,
      `axon_llm_chain?select=*&account_id=eq.${PLATFORM_ACCOUNT_ID}&order=position.asc`,
    );
    if (platformRows?.length) return platformRows;
  }
  return DEFAULT_LLM_CHAIN.map((tier, i) => ({ tier, position: i, enabled: true }));
}

/** Resolves a tier to its route + best model. Never throws — a missing/misconfigured route
 *  just makes the tier unresolvable, which axonGenerate logs and skips past. */
async function resolveTierLane(supabaseKey, tier) {
  const routeName = TIER_ROUTE_NAME[tier];
  if (!routeName) return null;
  const routes = await sbGet(supabaseKey, `router_routes?select=*&name=eq.${routeName}`);
  const route = routes?.[0];
  if (!route || route.enabled === false) return null;
  const models = await sbGet(
    supabaseKey,
    `router_models?select=*&route_id=eq.${route.id}&enabled=eq.true&order=priority.asc`,
  );
  if (!models?.length) return { route, model: null };
  // openrouter: honor the "FREE models" requirement explicitly, don't just take priority #1.
  const model = tier === 'openrouter' ? models.find((m) => m.cost_tier === 0) || models[0] : models[0];
  return { route, model };
}

function localPromptFromMessages(messages) {
  const system = messages.find((m) => m.role === 'system')?.content || '';
  return `${system}\n\n${messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n')}\nAssistant:`;
}

/** Runs one tier of the chain. Returns { text, usedAccountKey, viaBackup }. Throws on failure
 *  (caller logs + falls through). Account keys, when set, always beat the platform key. */
async function executeChainTier(supabaseKey, { tier, route, model, accountId }, messages) {
  if (tier === 'local') {
    const prompt = localPromptFromMessages(messages);
    const body = JSON.stringify({ model: model.model, prompt, stream: false, think: false });
    const base = route.base_url || 'http://localhost:11434';
    const stdout = await queueMiniShellJob(
      supabaseKey,
      `curl -s -m 40 ${base}/api/generate -d ${JSON.stringify(body)}`,
      { title: `axon-chain-local-${model.model}` },
    );
    if (!stdout) throw new Error('local tier: no response from the mini');
    const text = JSON.parse(stdout)?.response?.trim();
    if (!text) throw new Error('local tier: empty response');
    return { text, usedAccountKey: false, viaBackup: false };
  }

  const provider = TIER_KEY_PROVIDER[tier];
  const accountKeyRow = provider ? await getAccountKey(supabaseKey, accountId, provider) : null;
  const usedAccountKey = !!accountKeyRow;
  let apiKey = accountKeyRow?.key || (await loadSecret(supabaseKey, route.secret_key));

  if (tier === 'gemini') {
    if (!apiKey) throw new Error('gemini tier: no key configured');
    try {
      return { text: await callGemini(apiKey, model.model, messages), usedAccountKey, viaBackup: false };
    } catch (err) {
      // The locked chain names GEMINI_API_KEY / _BACKUP explicitly — only the platform's
      // own backup key is tried; an account key that fails does not fall back to a
      // platform credential the account never asked to use.
      if (usedAccountKey) throw err;
      const backupKey = await loadSecret(supabaseKey, 'GEMINI_API_KEY_BACKUP');
      if (!backupKey) throw err;
      return { text: await callGemini(backupKey, model.model, messages), usedAccountKey: false, viaBackup: true };
    }
  }

  if (tier === 'anthropic') {
    if (!apiKey) throw new Error('anthropic tier: no key configured');
    return { text: await callAnthropic(apiKey, model.model, messages), usedAccountKey, viaBackup: false };
  }

  // runpod, openrouter — both OpenAI-compatible.
  let baseUrl = route.base_url;
  if (tier === 'runpod' && !baseUrl) {
    baseUrl = await loadSecret(supabaseKey, 'RUNPOD_AXON_V1_ENDPOINT');
  }
  if (!baseUrl) throw new Error(`${tier} tier: not deployed yet — no endpoint configured`);
  if (!apiKey) throw new Error(`${tier} tier: no key configured`);
  return {
    text: await callOpenAICompatible(baseUrl, apiKey, model.model, messages),
    usedAccountKey,
    viaBackup: false,
  };
}

/**
 * The one door for plain text generation. Walks the account's LLM chain in locked-default
 * order (or its own reordered/disabled version), account keys before platform keys, logging
 * every attempt via recordLlmUsage.
 *
 * @param {string} supabaseKey
 * @param {object} opts
 * @param {string|null} [opts.accountId]
 * @param {Array<{role:string,content:string}>} [opts.messages] - either this or system/user
 * @param {string} [opts.system]
 * @param {string} [opts.user]
 * @param {string} [opts.kind] - free-form label, folded into the usage-log meta (e.g. capability class)
 * @param {string} [opts.agentName] - identity for recordLlmUsage
 * @returns {Promise<{text: string, provider: string, model: string|null, usage: {ms: number, attempts: number}}>}
 */
export async function axonGenerate(supabaseKey, opts = {}) {
  const { accountId = null, messages, system, user, kind = 'cheap_chat', agentName = 'axon-chain' } = opts;
  const msgs =
    messages && messages.length
      ? messages
      : [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...(user ? [{ role: 'user', content: user }] : []),
        ];
  if (!msgs.length) throw new Error('axonGenerate: pass messages, or system/user');

  const chainRows = await loadLlmChain(supabaseKey, accountId);
  const ordered = [...chainRows]
    .filter((r) => r.enabled !== false)
    .sort((a, b) => a.position - b.position);

  const attempts = [];
  for (const row of ordered) {
    const tier = row.tier;
    const start = Date.now();
    const resolved = await resolveTierLane(supabaseKey, tier).catch(() => null);

    if (!resolved || !resolved.route || (tier !== 'local' && !resolved.model) || (tier === 'local' && !resolved.model)) {
      const ms = Date.now() - start;
      const reason = 'tier not configured (missing route or model)';
      await recordLlmUsage(supabaseKey, {
        agentName,
        provider: tier,
        ms,
        meta: { kind, status: 'unresolved', reason, accountId },
      });
      attempts.push({ tier, error: reason });
      continue;
    }

    try {
      const out = await executeChainTier(supabaseKey, { tier, route: resolved.route, model: resolved.model, accountId }, msgs);
      const ms = Date.now() - start;
      await recordLlmUsage(supabaseKey, {
        agentName,
        provider: tier,
        model: resolved.model.model,
        ms,
        meta: { kind, status: 'ok', usedAccountKey: out.usedAccountKey, viaBackup: out.viaBackup, accountId },
      });
      return {
        text: out.text,
        provider: tier,
        model: resolved.model.model,
        usage: { ms, attempts: attempts.length + 1 },
      };
    } catch (err) {
      const ms = Date.now() - start;
      const reason = String(err?.message || err).slice(0, 300);
      await recordLlmUsage(supabaseKey, {
        agentName,
        provider: tier,
        model: resolved.model?.model || null,
        ms,
        meta: { kind, status: 'failed', reason, accountId },
      });
      attempts.push({ tier, error: reason });
    }
  }

  throw new Error(
    `axonGenerate: every tier in the chain failed or was unconfigured: ${attempts
      .map((a) => `${a.tier}: ${a.error}`)
      .join(' | ')}`,
  );
}

// ---------------------------------------------------------------------------
// 7. routeChat — the single entry point
// ---------------------------------------------------------------------------

/**
 * @param {string} supabaseKey
 * @param {object} args
 *   messages, mode ('auto'|'fixed'), laneOverride, fixedOrder, accountId, agentId,
 *   agentRole, hasMini, isComputerUse, requestId, venture, agentChain, agentDepth,
 *   agentHopCount, skipBootContext, chainDeadline, costTierFloor
 * @returns {Promise<{reply: string, route: string, decisionId: string|null, capabilityClass: string, tool: object|null}>}
 */
export async function routeChat(supabaseKey, args = {}) {
  const {
    messages = [],
    mode = 'auto',
    laneOverride = null,
    fixedOrder = null,
    accountId = null,
    agentId = null,
    agentRole = '',
    hasMini = false,
    isComputerUse = false,
    requestId = null,
    venture = null,
    // Problem #4's loop-control state, threaded through every hop of an agent chain.
    // A caller that never fires an agent never has to know these exist.
    agentChain = [],
    agentDepth = 0,
    agentHopCount = 0,
    skipBootContext = false,
    // Whole fire-chain wall-clock budget (see lib/axon-agent-bus.mjs) — only meaningful
    // when agentId is also set; a plain chat call without a firing agent never sets this
    // and routeChat itself does nothing with it beyond handing it back to handleToolCall.
    chainDeadline = null,
    // Operator's manual power-bar lock (POWER_LEVEL_TO_COST_TIER_FLOOR), only meaningful
    // when their powerMode.autoSwitchEnabled is false. null = no floor, unchanged behavior.
    costTierFloor = null,
  } = args;

  // Problem #7: every agent reply carries its own boot context (instructions, live
  // golden skills, live rules, its own authority row, its last logged run) instead
  // of starting from nothing. Prepended to the caller's own system message rather
  // than replacing it — an agent's own request-specific system prompt still wins.
  let effectiveMessages = messages;
  if (agentId && !skipBootContext) {
    const { systemPrompt } = await buildAgentBootContext(agentId);
    if (systemPrompt) {
      const hasSystem = messages.some((m) => m.role === 'system');
      effectiveMessages = hasSystem
        ? messages.map((m) => (m.role === 'system' ? { ...m, content: `${systemPrompt}\n\n${m.content}` } : m))
        : [{ role: 'system', content: systemPrompt }, ...messages];
    }
  }

  const userMessage = [...effectiveMessages].reverse().find((m) => m.role === 'user')?.content || '';
  const capabilityClass = await classifyCapability(supabaseKey, {
    userMessage,
    agentRole,
    isComputerUse,
    historyLength: effectiveMessages.length,
  });

  // The plain text path (no pin, no computer-use/vision/tool-agentic capability need) is
  // the ONE locked LLM chain, not the general capability-scored lane pool — Decision #1721.
  // A chain failure (every tier unconfigured/down) falls through to the legacy lane scoring
  // below rather than stranding the caller.
  if (mode !== 'fixed' && capabilityClass === 'cheap_chat') {
    try {
      const gen = await axonGenerate(supabaseKey, {
        accountId,
        messages: effectiveMessages,
        kind: capabilityClass,
        agentName: agentRole || agentId || 'routeChat',
      });
      const routeLabel = `${gen.provider} / ${gen.model}`;
      const decision = await sbPost(
        supabaseKey,
        'axon_router_decisions',
        {
          account_id: accountId,
          agent_id: agentId,
          request_id: requestId,
          capability_class: capabilityClass,
          candidates: [{ lane_id: null, model: gen.model, route: gen.provider, score: 1, reasons: ['the locked LLM chain'] }],
          chosen_lane_id: null,
          chosen_reason: `Picked ${routeLabel} — position ${gen.usage.attempts} in the locked LLM chain.`,
          fell_through_from: gen.usage.attempts > 1 ? [{ lane_id: null, error: `${gen.usage.attempts - 1} earlier tier(s) unavailable` }] : null,
        },
        'return=representation',
      );

      let tool = null;
      if (agentId) {
        tool = await handleToolCall(gen.text, {
          agentId,
          ventureId: venture,
          depth: agentDepth,
          hopCount: agentHopCount,
          chain: agentChain,
          requestId,
          chainDeadline,
        });
      }

      return {
        reply: gen.text,
        route: routeLabel,
        capabilityClass,
        decisionId: Array.isArray(decision) ? decision[0]?.id ?? null : null,
        tool,
      };
    } catch {
      // Whole chain unavailable — fall through to capability-scored lane pool below rather
      // than fail the call outright.
    }
  }

  const all = await listCandidateLanes(supabaseKey, { accountId });
  if (!all.length) throw new Error('no lanes available — connect a provider in Settings');

  let ranked;
  if (mode === 'fixed' && (laneOverride || fixedOrder)) {
    const wanted = laneOverride ? [laneOverride] : fixedOrder;
    ranked = wanted
      .map((id) => all.find((l) => l.laneId === id))
      .filter(Boolean)
      .map((lane) => ({ lane, score: 1, reasons: ['pinned by the operator'] }));
    // A pin that no longer resolves must not strand the agent.
    if (!ranked.length) ranked = scoreLanes(all, { capabilityClass, costTierFloor });
  } else {
    ranked = scoreLanes(all, { capabilityClass, costTierFloor });
  }
  // The operator's power-bar lock (costTierFloor) must never strand a reply just because no
  // lane happens to sit at or above the locked tier for this capability right now — a
  // preference should degrade gracefully, not break chat. Retry unfiltered before giving up.
  if (!ranked.length && costTierFloor != null) ranked = scoreLanes(all, { capabilityClass });
  if (!ranked.length) throw new Error(`no lane can serve "${capabilityClass}"`);

  const fellThrough = [];
  for (const cand of ranked) {
    try {
      const out = await executeLane(supabaseKey, cand.lane, effectiveMessages, { hasMini });
      if (out.unavailable) {
        fellThrough.push({ lane_id: cand.lane.laneId, error: out.reason });
        continue;
      }
      await recordHealth(supabaseKey, cand.lane, true);
      const routeLabel = `${cand.lane.route.name} / ${cand.lane.model}`;
      const chosenReason =
        `Picked ${routeLabel} — ${cand.reasons.join(', ')}.` +
        (fellThrough.length ? ` Fell through ${fellThrough.length} lane(s) first.` : '');
      const decision = await sbPost(
        supabaseKey,
        'axon_router_decisions',
        {
          account_id: accountId,
          agent_id: agentId,
          request_id: requestId,
          capability_class: capabilityClass,
          candidates: ranked.slice(0, 8).map((c) => ({
            lane_id: c.lane.laneId,
            model: c.lane.model,
            route: c.lane.route.name,
            score: Number(c.score.toFixed(4)),
            reasons: c.reasons,
          })),
          chosen_lane_id: cand.lane.laneId,
          chosen_reason: chosenReason,
          fell_through_from: fellThrough.length ? fellThrough : null,
        },
        'return=representation',
      );
      await recordUsage(supabaseKey, { lane: cand.lane, venture });

      // Tool-calling: an agent's reply may request an action (hand work to another
      // agent, flag JB, or declare itself done) instead of only producing prose.
      // Never lets a bad or malicious block do anything — handleToolCall parses +
      // validates before it ever touches fireAgent, and fireAgent re-checks the
      // loop guards, the FIRE gate, and live authority on its own regardless of
      // what this caller passes in.
      let tool = null;
      if (agentId) {
        tool = await handleToolCall(out.reply, {
          agentId,
          ventureId: venture,
          depth: agentDepth,
          hopCount: agentHopCount,
          chain: agentChain,
          requestId,
          chainDeadline,
        });
      }

      return {
        reply: out.reply,
        route: routeLabel,
        capabilityClass,
        decisionId: Array.isArray(decision) ? decision[0]?.id ?? null : null,
        tool,
      };
    } catch (err) {
      await recordHealth(supabaseKey, cand.lane, false, err?.message || err);
      fellThrough.push({ lane_id: cand.lane.laneId, error: String(err?.message || err).slice(0, 300) });
    }
  }

  throw new Error(
    `every lane failed for "${capabilityClass}": ${fellThrough.map((f) => f.error).join(' | ')}`,
  );
}
