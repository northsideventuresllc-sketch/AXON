/**
 * One door for plain text generation.
 *
 * Every caller in this repo that used to hand-roll its own provider waterfall
 * (local -> RunPod -> Gemini -> paid Anthropic, copied five or six times with
 * small differences) now calls through here, which calls axonGenerate() in
 * lib/axon-router-core.mjs — the single locked chain (DEFAULT_LLM_CHAIN):
 *
 *   local -> runpod -> openrouter -> gemini -> anthropic
 *
 * Free tiers first, paid last: that order lives in the router and is never
 * reordered here. This module adds exactly two things on top of axonGenerate:
 *
 *   1. `laneSource()` — maps the lane that answered back to the legacy
 *      "source"/"provider" tag each caller already returns to its own callers
 *      and writes into NI-Brain rows, so those payloads do not change shape.
 *   2. `generateViaRouter()` — an injectable seam. Callers take an optional
 *      `generate` argument defaulting to this function so tests can substitute
 *      a stub with no network at all.
 *
 * It never falls back to a direct provider call: if the whole chain is
 * unreachable the error propagates, and each caller keeps its own existing
 * raw/no-LLM fallback (SERP metadata, heuristic synthesis, raw search titles).
 */
import { axonGenerate } from './axon-router-core.mjs';

/** Chain lane -> the source tag callers were already returning before the rewire. */
const LANE_SOURCE = {
  local: 'axon-local',
  runpod: 'axon-v1-runpod',
  openrouter: 'openrouter',
  gemini: 'gemini',
  anthropic: 'anthropic',
};

/** @param {string|null|undefined} lane */
export function laneSource(lane) {
  return LANE_SOURCE[lane] || lane || 'router';
}

/**
 * @param {string} supabaseKey service key the router needs to read its own config
 * @param {{system?: string, user?: string, messages?: Array<{role: string, content: string}>,
 *          kind?: string, agentName?: string, accountId?: string|null, maxTokens?: number,
 *          jsonMode?: boolean, hasMini?: boolean}} opts hasMini gates any subscription-kind
 *          tier (claude_subscription/chatgpt_subscription/gemini_subscription) the account
 *          may have opted into its own axon_llm_chain — defaults false, same as axonGenerate.
 * @returns {Promise<{text: string, provider: string, model: string|null, source: string}>}
 */
export async function generateViaRouter(supabaseKey, opts = {}) {
  const {
    system,
    user,
    messages,
    kind = 'cheap_chat',
    agentName = 'axon',
    accountId = null,
    maxTokens,
    jsonMode,
    hasMini = false,
  } = opts;
  const out = await axonGenerate(supabaseKey || '', {
    system,
    user,
    messages,
    kind,
    agentName,
    accountId,
    maxTokens,
    jsonMode,
    hasMini,
  });
  return { text: out.text, provider: out.provider, model: out.model, source: laneSource(out.provider) };
}
