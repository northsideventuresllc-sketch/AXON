/**
 * council-gate-client-core.mjs — the ONE door AXON code uses to reach
 * COUNCIL GATE instead of merging a PR itself.
 *
 * Per JB Decision #2029: COUNCIL GATE is the sole merger. This wraps the
 * DB door `public.fn_request_council_gate_review(...)` (service_role only,
 * NI-Brain project kxijunwgbrlfzvgkhklo), which creates/dedupes a queued
 * agent_dispatch ticket owner='COUNCIL GATE' and auto-fires GATE.
 *
 * Plain .mjs on purpose (same reasoning as lib/axon-fire-gate-core.mjs and
 * lib/axon-router-core.mjs): importable both from Next.js/TS
 * (`./council-gate-client.ts` re-exports this with types) and from raw
 * `node` scripts / GitHub Actions / `node --test` with no TypeScript loader.
 *
 * This is the AXON-side counterpart of nv-vault's
 * `scripts/lib/council-gate-client.mjs` (same RPC, same payload shape) — for
 * any AXON code path (agent, route, script) that currently opens or would
 * open a PR and merge it directly. It respects `lib/axon-fire-gate.ts`: a
 * merge is a FIRE-class action, so callers must check `isFireAllowed()`
 * before calling this (this client itself does not merge anything, but it
 * is the replacement for a merge step that was gated the same way).
 *
 * Usage:
 *   import { requestCouncilGateReview } from './council-gate-client-core.mjs';
 *   const result = await requestCouncilGateReview({
 *     repo: 'AXON', pr: 42, requester: 'axon-executive-agent',
 *     summary: 'one-line goal', headSha: 'abc123...',
 *   });
 *
 * Env (matches lib/axon-secrets.mjs's getSupabaseServiceKey precedence):
 *   NI_BRAIN_SUPABASE_URL or SUPABASE_URL  (defaults to the NI-Brain project URL)
 *   SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY  (required, service_role)
 *
 * Never merges, never sets needs_jb_approval, never touches approve_token.
 * Callers MUST NOT merge a PR after calling this — this call is the request,
 * not a merge; COUNCIL GATE is the only merger.
 */

const DEFAULT_SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

/** @returns {string} */
export function getSupabaseUrl() {
  return process.env.NI_BRAIN_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

/** @returns {string} */
export function getServiceKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

/**
 * @param {object} opts
 * @param {string} opts.repo - short repo name (e.g. "AXON", "nv-vault")
 * @param {number|string} opts.pr - PR number
 * @param {string} opts.requester - identifies the calling agent
 * @param {string|null} [opts.summary] - one-line goal/summary
 * @param {string|null} [opts.headSha] - PR head SHA, if known
 * @param {typeof fetch} [opts.fetchImpl] - injectable for tests
 * @returns {Promise<{ok: true, ticket: unknown}>}
 */
export async function requestCouncilGateReview({
  repo,
  pr,
  requester,
  summary = null,
  headSha = null,
  fetchImpl = fetch,
} = {}) {
  if (!repo) throw new Error('requestCouncilGateReview: repo is required');
  if (pr === undefined || pr === null || pr === '') {
    throw new Error('requestCouncilGateReview: pr is required');
  }
  if (!requester) throw new Error('requestCouncilGateReview: requester is required');

  const key = getServiceKey();
  if (!key) {
    throw new Error(
      'requestCouncilGateReview: no service key set (SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY)',
    );
  }

  const url = `${getSupabaseUrl()}/rest/v1/rpc/fn_request_council_gate_review`;
  const payload = {
    p_repo: repo,
    p_pr: Number(pr),
    p_requester: requester,
    p_summary: summary,
    p_head_sha: headSha,
  };

  const r = await fetchImpl(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`requestCouncilGateReview failed: HTTP ${r.status} ${err.slice(0, 300)}`);
  }

  const ticket = await r.json().catch(() => null);
  return { ok: true, ticket };
}
