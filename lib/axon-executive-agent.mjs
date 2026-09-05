/**
 * AXON EXECUTIVE AGENT — lib/axon-executive-agent.mjs
 *
 * Rebuild of AX-WISDOM-LOOP (2026-08-26, JB direct order). This is now the
 * nightly brain AND cross-platform bridge for the whole AXON system:
 *   1. Ingest — everything AX-WISDOM-LOOP already did (unchanged, via
 *      runWisdomAbsorbLoop) PLUS durable Decisions/Learnings (durability
 *      column), recent git commits across NVG's repos, and research
 *      findings — packaged into the SAME training-bundle JSON format the
 *      existing nightly model-rebuild step (nv-vault
 *      scripts/axon-daily-model-build.mjs, via scripts/lib/
 *      axon-training-ingest.mjs) already reads. See mergeIntoTrainingBundle().
 *   2. RunPod — best-effort manifest sync of the newest local Ollama build
 *      to the AXON v1 RunPod endpoint at the end of the run. Logs clearly
 *      and never hard-fails the run if RunPod is unreachable.
 *   3. Bridge — reads agent_bus rows addressed to this agent
 *      (to_agent='AXON Executive'), and writes its own summary back
 *      out (from_agent='AXON Executive') the same way every other
 *      AXON agent does, plus posts a human-readable wrap to Slack
 *      #agent-ops via the slack-post edge function.
 *   4. Standing rules — self-checkpoints and asks for a resume within ~12h
 *      if it hits a time-box; loop-engineers (writes what worked/didn't,
 *      reads it back in on the next run); urgent JB-facing alerts go via
 *      Telegram only, plain-English/ADHD-friendly/light-emoji.
 *
 * Nothing in wisdom-absorb-loop.mjs is modified — this module wraps it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runWisdomAbsorbLoop, wisdomLoopChecklist } from './wisdom-absorb-loop.mjs';
import { SUPABASE_URL } from './constants.mjs';
import { AGENT } from './agent-names.mjs';
import { postAgentOps, SLACK_CHANNEL_ID as SHARED_SLACK_CHANNEL_ID } from './slack-post.mjs';

export { runWisdomAbsorbLoop, wisdomLoopChecklist };

export const AGENT_NAME = AGENT.EXECUTIVE_AGENT;
export const CRON_JOB_ID = 'axon-executive-agent';
export const SLACK_CHANNEL_ID = SHARED_SLACK_CHANNEL_ID;

// Known NVG repos to scan for nightly git history (owner: northsideventuresllc-sketch).
export const NVG_REPOS = [
  'AXON',
  'nv-vault',
  'matchfit',
  'northside-intelligence',
  'northsideventuresgroup',
  'streampass',
];
const GH_OWNER = 'northsideventuresllc-sketch';

// Soft time-box: if a run runs longer than this, checkpoint + ask for resume within ~12h
// instead of the normal 24h next_run_at, per JB's standing rule (2026-08-26).
export const TIME_BUDGET_MS = 8 * 60 * 1000;
const RESUME_WINDOW_MS = 12 * 60 * 60 * 1000;
const NORMAL_NEXT_RUN_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Secrets (env wins over ni_platform_secrets — same convention as the rest of AXON)
// ---------------------------------------------------------------------------
export async function secret(sbSelect, key) {
  if (process.env[key]?.trim()) return process.env[key].trim();
  if (!sbSelect) return '';
  try {
    const rows = await sbSelect(
      'ni_platform_secrets',
      `key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    );
    return rows?.[0]?.value?.trim() || '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 1a. Durable Decisions / Learnings — beyond the operational pull already in
//     wisdom-absorb-loop.mjs, this specifically surfaces rows where the
//     `durability` column is set (e.g. 'stable' / 'operational'), i.e. things
//     JB/the system already judged worth remembering long-term, not every
//     day's operational chatter.
// ---------------------------------------------------------------------------
export async function fetchDurableSignals(sbSelect) {
  const out = { durableDecisions: [], durableLearnings: [], error: null };
  if (!sbSelect) return out;
  try {
    const [decisions, learnings] = await Promise.all([
      sbSelect(
        'Decisions',
        'durability=not.is.null&select=id,date,decision,durability&order=date.desc&limit=25',
      ),
      sbSelect(
        'Learnings',
        'durability=not.is.null&select=id,date,learning,category,project,durability&order=date.desc&limit=25',
      ),
    ]);
    out.durableDecisions = decisions || [];
    out.durableLearnings = learnings || [];
  } catch (err) {
    out.error = err.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1b. Recent git history across NVG's repos (last N hours), via the GitHub
//     REST API. One repo failing (private/renamed/rate-limited) never kills
//     the others — each is isolated and logged.
// ---------------------------------------------------------------------------
export async function fetchRecentCommits(ghToken, { repos = NVG_REPOS, sinceHours = 24 } = {}) {
  const since = new Date(Date.now() - sinceHours * 3600000).toISOString();
  const results = [];
  if (!ghToken) {
    return { commits: results, reachable: false, reason: 'no GH_PAT' };
  }
  for (const repo of repos) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${repo}/commits?since=${since}&per_page=15`,
        {
          headers: {
            Authorization: `token ${ghToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'axon-executive-agent',
          },
        },
      );
      if (!r.ok) {
        results.push({ repo, ok: false, status: r.status });
        continue;
      }
      const data = await r.json();
      if (!Array.isArray(data)) {
        results.push({ repo, ok: false, error: 'unexpected response shape' });
        continue;
      }
      results.push({
        repo,
        ok: true,
        count: data.length,
        commits: data.slice(0, 10).map((c) => ({
          sha: c.sha?.slice(0, 10),
          message: (c.commit?.message || '').split('\n')[0].slice(0, 160),
          author: c.commit?.author?.name || 'unknown',
          date: c.commit?.author?.date,
        })),
      });
    } catch (err) {
      results.push({ repo, ok: false, error: err.message });
    }
  }
  return { commits: results, reachable: true, sinceHours };
}

// ---------------------------------------------------------------------------
// 1c. Package everything into the SAME training-bundle JSON the existing
//     model-rebuild step (nv-vault scripts/axon-daily-model-build.mjs, via
//     scripts/lib/axon-training-ingest.mjs) already reads:
//       <VAULT_GIT>/_AI/axon-training/<date>.json
//     bundleDigestLines() there already flattens bundle.niBrain.learnings
//     and bundle.niBrain.decisions straight into the nightly SYSTEM prompt —
//     so appending durable rows into those exact arrays (deduped by id) is
//     the one, real way to make them actually influence the next model
//     build without touching the nv-vault repo at all. Anything that doesn't
//     fit an existing recognized key (git commits, research findings) is
//     added under a new `executiveAgentSignals` key — additive, never
//     destructive of a bundle already written earlier that day by
//     axon-training-ingest. Fully best-effort: if the vault isn't reachable
//     on this filesystem (e.g. running somewhere other than the Mac mini),
//     this returns { skipped: true } instead of throwing.
// ---------------------------------------------------------------------------
export function mergeIntoTrainingBundle({
  vaultRoot,
  date,
  durableDecisions = [],
  durableLearnings = [],
  commitsResult = null,
  researchFindings = [],
}) {
  if (!vaultRoot || !existsSync(vaultRoot)) {
    return { skipped: true, reason: 'vault root not reachable on this filesystem' };
  }
  const dir = join(vaultRoot, '_AI', 'axon-training');
  const jsonPath = join(dir, `${date}.json`);
  let bundle;
  try {
    mkdirSync(dir, { recursive: true });
    bundle = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : null;
  } catch (err) {
    return { skipped: true, reason: `read/parse failed: ${err.message}` };
  }
  if (!bundle) {
    bundle = {
      meta: { collectedAt: new Date().toISOString(), date, source: 'axon-executive-agent-scaffold' },
      niBrain: { learnings: [], decisions: [], context: [] },
    };
  }
  bundle.niBrain = bundle.niBrain || { learnings: [], decisions: [], context: [] };
  bundle.niBrain.learnings = bundle.niBrain.learnings || [];
  bundle.niBrain.decisions = bundle.niBrain.decisions || [];

  const seenLearningIds = new Set(bundle.niBrain.learnings.map((l) => l.id).filter((x) => x != null));
  for (const l of durableLearnings) {
    if (l.id != null && seenLearningIds.has(l.id)) continue;
    bundle.niBrain.learnings.push({ ...l, learning: `[durable:${l.durability}] ${l.learning}` });
    if (l.id != null) seenLearningIds.add(l.id);
  }

  const seenDecisionIds = new Set(bundle.niBrain.decisions.map((d) => d.id).filter((x) => x != null));
  for (const d of durableDecisions) {
    if (d.id != null && seenDecisionIds.has(d.id)) continue;
    bundle.niBrain.decisions.push({ ...d, decision: `[durable:${d.durability}] ${d.decision}` });
    if (d.id != null) seenDecisionIds.add(d.id);
  }

  bundle.executiveAgentSignals = {
    mergedAt: new Date().toISOString(),
    mergedBy: AGENT_NAME,
    recentCommits: commitsResult,
    researchFindingsDurable: researchFindings,
    note:
      'Surfaced here for the record. Only niBrain.learnings/decisions above are currently ' +
      'read into the nightly SYSTEM prompt by bundleDigestLines() in nv-vault — wiring ' +
      'recentCommits/researchFindingsDurable into the prompt itself needs a small follow-up ' +
      'edit in that (separate) repo. Flagged, not silently assumed done.',
  };

  try {
    writeFileSync(jsonPath, JSON.stringify(bundle, null, 2));
  } catch (err) {
    return { skipped: true, reason: `write failed: ${err.message}` };
  }
  return {
    skipped: false,
    jsonPath,
    learningsAdded: durableLearnings.length,
    decisionsAdded: durableDecisions.length,
  };
}

// ---------------------------------------------------------------------------
// 2. RunPod — best-effort manifest sync of the newest local Ollama build.
//    JB's exact scope (confirmed 2026-08-26): "upload the newest model to
//    RunPod at the end of the nightly build." There is no established
//    weight-upload/registry mechanism in this codebase (AXON v1 on RunPod is
//    a separately fine-tuned model per Decision #1256/#1261, not the same
//    artifact as the local axon-ornith/axon-llama Ollama build) — so this
//    posts a manifest (model tag, build timestamp, Modelfile hash) to the
//    endpoint's /run as a sync signal. Never throws; on any failure it
//    returns a clear, logged reason instead of failing the run.
// ---------------------------------------------------------------------------
export async function uploadNewestModelToRunPod(sbSelect, { modelfileDir } = {}) {
  const [endpointId, runpodKey] = await Promise.all([
    secret(sbSelect, 'RUNPOD_AXON_V1_ENDPOINT_ID'),
    secret(sbSelect, 'RUNPOD_AXON_V1_KEY'),
  ]);
  if (!endpointId || !runpodKey) {
    return {
      attempted: false,
      ok: false,
      reason: 'RUNPOD_AXON_V1_KEY/RUNPOD_AXON_V1_ENDPOINT_ID not set in ni_platform_secrets',
    };
  }

  const dir = modelfileDir || join(process.env.HERMES_HOME || `${process.env.HOME}/.hermes`, 'modelfiles');
  const manifest = { builtAt: new Date().toISOString(), models: [] };
  for (const name of ['axon-ornith', 'axon-llama']) {
    const p = join(dir, `${name}.Modelfile`);
    if (!existsSync(p)) continue;
    try {
      const body = readFileSync(p, 'utf8');
      const { createHash } = await import('node:crypto');
      manifest.models.push({
        name,
        sha256: createHash('sha256').update(body).digest('hex').slice(0, 16),
        bytes: body.length,
      });
    } catch {
      // one unreadable Modelfile shouldn't block the manifest for the other
    }
  }
  if (!manifest.models.length) {
    return { attempted: false, ok: false, reason: 'no local .Modelfile found to package' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`https://api.runpod.io/v2/${endpointId}/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${runpodKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { action: 'sync-model-manifest', manifest } }),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { attempted: true, ok: false, reason: `RunPod HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON success body is fine, still counts as reached */
    }
    return { attempted: true, ok: true, manifest, runpodJobId: data?.id || null };
  } catch (err) {
    return { attempted: true, ok: false, reason: `RunPod unreachable: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 3. Cross-platform bridge — agent_bus in/out, same mechanism every other
//    NVG/AXON agent uses.
// ---------------------------------------------------------------------------
export async function readAgentBusInbox(sbSelect) {
  if (!sbSelect) return [];
  try {
    const rows = await sbSelect(
      'agent_bus',
      `to_agent=eq.${encodeURIComponent(AGENT_NAME)}&status=eq.open&order=created_at.asc&limit=25`,
    );
    return rows || [];
  } catch {
    return [];
  }
}

export async function markAgentBusHandled(sbPatch, id) {
  if (!sbPatch) return false;
  try {
    await sbPatch('agent_bus', `id=eq.${id}`, {
      status: 'answered',
      answered_by: AGENT_NAME,
      answered_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function postToAgentBus(sbInsert, { to_agent, subject, body, needs_answer = false }) {
  if (!sbInsert) return null;
  try {
    return await sbInsert('agent_bus', {
      from_agent: AGENT_NAME,
      to_agent,
      subject,
      body,
      needs_answer,
      status: 'open',
    });
  } catch {
    return null;
  }
}

// Thin wrapper over the shared lib/slack-post.mjs helper — keeps this module's
// existing `postSlack(headline, body)` call sites while guaranteeing every post
// carries the required `*<agent> — <headline>*` bold header.
export async function postSlack(headline, body = '') {
  return postAgentOps({ agentName: AGENT_NAME, headline, body });
}

// Urgent JB-facing alerts ONLY — Telegram, not Slack, not a generic notify.
// Plain English, ADHD-friendly, light emoji, no jargon (standing rule).
export async function alertTelegramUrgent(sbSelect, text) {
  const [token, chatId] = await Promise.all([
    secret(sbSelect, 'TELEGRAM_BOT_TOKEN'),
    secret(sbSelect, 'TELEGRAM_CHAT_ID'),
  ]);
  if (!token || !chatId) {
    return { ok: false, reason: 'TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not available' };
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: !!data.ok, raw: data.ok ? undefined : data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// 4. Standing rules — time-box / self-reschedule + loop-engineering memory.
//    The job pattern here is Mac cron/launchd (fixed daily schedule, no
//    built-in delay-queue) — so "resume within ~12h" is wired the honest way
//    available to it: axon_cron_jobs.next_run_at is set to +12h instead of
//    the normal +24h when the time-box is hit, and a checkpoint state file
//    records exactly what was left unfinished so the NEXT run (whenever
//    cron/launchd/mini next fires it) picks that up first. True sub-daily
//    self-firing would need a second launchd interval or a delay-capable
//    queue, which does not exist yet — flagged, not faked.
// ---------------------------------------------------------------------------
export function checkTimeBudget(startedAtMs) {
  const elapsed = Date.now() - startedAtMs;
  return { overBudget: elapsed > TIME_BUDGET_MS, elapsedMs: elapsed };
}

function stateFilePath() {
  const home = process.env.HERMES_HOME || `${process.env.HOME}/.hermes`;
  return join(home, 'axon-learner', 'executive-agent-state.json');
}

export function loadRunState() {
  const p = stateFilePath();
  if (!existsSync(p)) return { runs: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { runs: [] };
  }
}

export function saveRunState(state) {
  const p = stateFilePath();
  try {
    mkdirSync(join(p, '..'), { recursive: true });
    if (state.runs?.length > 20) state.runs = state.runs.slice(-20);
    writeFileSync(p, JSON.stringify(state, null, 2));
    return true;
  } catch {
    return false;
  }
}

export async function registerCron(serviceKey, { status, summary, overBudget }) {
  if (!serviceKey) return false;
  const now = new Date();
  const next = new Date(now.getTime() + (overBudget ? RESUME_WINDOW_MS : NORMAL_NEXT_RUN_MS));
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/axon_cron_jobs?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: CRON_JOB_ID,
        last_run_at: now.toISOString(),
        last_run_status: status,
        last_run_summary: summary.slice(0, 500),
        next_run_at: next.toISOString(),
      }),
    });
    if (!r.ok) {
      console.warn(`registerCron failed: HTTP ${r.status} ${await r.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('registerCron failed:', err.message);
    return false;
  }
}
