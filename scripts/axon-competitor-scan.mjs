#!/usr/bin/env node
/**
 * AXON Competitor Scan — REBUILT 2026-10-06, JB direct order (build ticket
 * IU2-AXON-COMPETITOR-1006). Runs on the Mac mini, Mon/Wed/Fri 8:00 AM Eastern
 * (roster routine_id `axon-competitor-scan`, cron `0 8 * * 1,3,5`).
 *
 * The standalone nv-vault script (.github/scripts/axon-competitor-scan.mjs) was deleted
 * 2026-09-06 when it was folded into AXON Research (Decision #1767); the AXON-repo wiring
 * for the per-competitor deep scan was never finished, so nothing has run since. This is
 * that job again, built on the code AXON Research already uses:
 *   - web search:  lib/web-search.mjs (SerpApi, DuckDuckGo when SerpApi has no quota)
 *   - LLM chain:   lib/axon-generate.mjs -> locked router chain (local, RunPod while funded,
 *                  OpenRouter free, Gemini free, paid Anthropic last)
 *   - comms:       lib/axon-agent-comms.mjs (agent_bus hand-off, resume flag, loop notes)
 *
 * What it does, per competitor in the rotation (registry in the vault's Competitive Intel
 * folder, 2 per run): pull real search results, keep only the ones that actually mention the
 * competitor, and ask the chain for ONE concrete gap (something they have that AXON does
 * not) turned into a build plan: what to build, steps, effort, priority, why it matters,
 * one plain-English line. Then:
 *   1. writes a dated Threat/Pivot report (+ LATEST.md) into the vault's Competitive Intel folder
 *   2. hands the gap plans to the AXON Executive over agent_bus (needs_answer=true)
 *   3. flags itself to resume within ~12h if it hit its time budget
 *   4. loop-engineers: writes what worked / broke, and who to retry first, for the next run
 *
 * NEVER-HEURISTIC RULE (JB): a competitor with no real source this run says so and retries
 * next run. No model call is made without sources, no plan is accepted unless it cites a
 * source that was actually fetched, and there is no registry-baseline "stand-in" plan. The
 * old script's heuristic fallback is gone on purpose.
 *
 * NEVER messages JB (JB hears only through EXEC), never sends or posts to a person, never
 * spends money outside the router chain's own free-first order.
 *
 * Usage:
 *   node scripts/axon-competitor-scan.mjs --dry-run     # no network, no model, no database writes
 *   node scripts/axon-competitor-scan.mjs               # real run
 *   node scripts/axon-competitor-scan.mjs --date=2026-10-07   # pick the rotation slot for a date
 *
 * Environment (names only, values never printed or committed):
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) — required for a real run
 *   SERPAPI_API_KEY_AXON / SERPAPI_API_KEY — optional, env or ni_platform_secrets
 *   NV_VAULT_GIT_DIR — vault checkout, default ~/nv-vault
 *   AXON_COMPSCAN_PER_RUN (default 2), AXON_COMPSCAN_TIME_BUDGET_MS (default 480000)
 *   AXON_DRY_RUN=1 — same as --dry-run
 * Model-provider keys are read by the router chain itself (env first, then ni_platform_secrets).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import { webSearch } from '../lib/web-search.mjs';
import { generateViaRouter } from '../lib/axon-generate.mjs';
import { AGENT } from '../lib/agent-names.mjs';
import { COMPETITOR_LANE_ID } from '../lib/axon-self-research-build-plans.mjs';
import {
  handoffToAgent,
  flagResumeNeeded,
  clearResumeFlag,
  readLastLoopNote,
  writeLoopNote,
} from '../lib/axon-agent-comms.mjs';

export const JOB_ID = 'axon-competitor-scan';
// Real folder name in the vault (old casing kept on disk, it is a path not copy).
export const INTEL_DIR_REL = 'NORTHSiDE Intelligence (NI)/Sector 5 — AXON/Competitive Intel';
const REGISTRY_FILE = 'competitor-registry.json';

const DEFAULT_PER_RUN = 2;
const DEFAULT_BUDGET_MS = 8 * 60_000;
const RESUME_HOURS = 12;
const MAX_QUERIES = 2; // SerpApi free plan is 250/month and shared, so 2 per competitor, not more
const MAX_SOURCES = 8;
const MAX_RETRY_STREAK = 3; // a competitor that returns nothing 3 runs running stops hogging the retry slot
const SEARCH_TIMEOUT_MS = 20_000;
const EFFORTS = ['small', 'medium', 'large'];
const PRIORITIES = ['high', 'medium', 'low'];

const SYSTEM_PROMPT =
  'You are AXON competitive intel for Northside (NVG). NVG strives to be the best no matter how long it takes. ' +
  'NEVER end on fear or "AXON is behind": every threat gets an immediate pivot, lead with action. ' +
  'Use ONLY the sources you are given. Never invent a competitor, feature, launch, price or number that is not in them. ' +
  'Return JSON only, no prose outside the JSON.';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const mdText = (value) => clip(value, 300).replace(/[[\]]/g, '');
const mdLink = (url) => String(url).replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

// ── args / env ────────────────────────────────────────────────────────────────

export function parseArgs(argv = [], env = {}) {
  const out = { dryRun: env.AXON_DRY_RUN === '1', date: null, help: false, unknown: [] };
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--dry') out.dryRun = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg.startsWith('--date=')) out.date = arg.slice('--date='.length);
    else out.unknown.push(arg);
  }
  return out;
}

export function resolveVaultRoot(env = process.env) {
  return env.NV_VAULT_GIT_DIR || path.join(env.HOME || '', 'nv-vault');
}

const dayStamp = (date) => date.toISOString().slice(0, 10);

/** Env-first, then ni_platform_secrets; dedicated research key before the shared one (SERPAPI-SHARED-QUOTA-STARVING-RESEARCH-0906). */
export async function resolveSerpKey(env, sbSelect) {
  for (const name of ['SERPAPI_API_KEY_AXON', 'SERPAPI_API_KEY']) {
    if (env[name]) return env[name];
    try {
      const rows = await sbSelect('ni_platform_secrets', `key=eq.${encodeURIComponent(name)}&select=value&limit=1`);
      if (rows?.[0]?.value) return rows[0].value;
    } catch {
      /* secret store unreachable: fall through, web-search has a keyless fallback */
    }
  }
  return null;
}

// ── registry + rotation ───────────────────────────────────────────────────────

export function loadRegistry(vaultRoot) {
  const file = path.join(vaultRoot, INTEL_DIR_REL, REGISTRY_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(`Competitor registry not found at ${file}. Set NV_VAULT_GIT_DIR to the vault checkout.`);
  }
  const registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(registry.competitors) || !registry.competitors.length) {
    throw new Error(`Competitor registry at ${file} has no competitors.`);
  }
  return { registry, file };
}

/** Same exclusion the old script used: a name collision is not a competitor. */
export function competitorPool(registry) {
  return registry.competitors.filter((c) => c?.name && c.category !== 'name_collision');
}

/**
 * Scheduled-run ordinal: Mon/Tue -> slot 0, Wed/Thu -> 1, Fri-Sun -> 2, three slots a week.
 * The old rotation used getUTCDay() % pool and so only ever reached 6 of the 9 competitors
 * on a Mon/Wed/Fri schedule. Stepping by `count` through the pool per run covers all of them.
 */
export function rotationOrdinal(date) {
  const dayNum = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
  const weekday = (dayNum + 3) % 7; // epoch day 0 was a Thursday, Monday = 0
  return Math.floor((dayNum + 3) / 7) * 3 + Math.min(2, Math.floor(weekday / 2));
}

/** Carry-over (retry / unfinished) competitors go first, then the rotation fills to `count`. */
export function pickCompetitors(pool, { date, count = DEFAULT_PER_RUN, carry = [] } = {}) {
  const byName = new Map(pool.map((c) => [c.name.toLowerCase(), c]));
  const picked = [];
  const seen = new Set();
  for (const item of carry) {
    const comp = byName.get(String(item.name).toLowerCase());
    if (comp && !seen.has(comp.name) && picked.length < count) {
      picked.push(comp);
      seen.add(comp.name);
    }
  }
  const start = (rotationOrdinal(date) * count) % pool.length;
  for (let i = 0; picked.length < count && i < pool.length; i++) {
    const comp = pool[(start + i) % pool.length];
    if (!seen.has(comp.name)) {
      picked.push(comp);
      seen.add(comp.name);
    }
  }
  return picked;
}

/** Registry baseline (their score vs AXON's target per capability axis). Same math as the old script. */
export function baselineGapSummary(comp, registry) {
  const axes = registry.capability_axes || [];
  const target = registry.axon_target_scores || {};
  const scores = comp.scores || {};
  const leads = [];
  const axonLeads = [];
  for (const axis of axes) {
    const c = scores[axis] ?? 0;
    const t = target[axis] ?? 0;
    if (c > t - 1 && c >= 2) leads.push(`${axis} (${c}/3)`);
    if (t >= 3 && c === 0) axonLeads.push(axis);
  }
  return { leads, axonLeads };
}

// ── sources ───────────────────────────────────────────────────────────────────

export function competitorAliases(comp) {
  const aliases = new Set();
  const name = String(comp.name || '').toLowerCase().trim();
  if (name) aliases.add(name);
  for (const part of name.split(/\s*\/\s*/)) {
    if (part) aliases.add(part);
    const first = part.split(/\s+/)[0];
    if (first && first.length >= 4) aliases.add(first);
  }
  try {
    const label = new URL(comp.url).hostname.replace(/^www\./, '').split('.')[0];
    if (label.length >= 4) aliases.add(label);
  } catch {
    /* no usable URL on the registry row */
  }
  return [...aliases];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A search result only counts as a source for this competitor if it actually names them. */
export function mentionsCompetitor(comp, row) {
  const hay = `${row.title || ''} ${row.snippet || ''} ${row.link || ''}`.toLowerCase();
  return competitorAliases(comp).some((a) => new RegExp(`(^|[^a-z0-9])${escapeRe(a)}([^a-z0-9]|$)`).test(hay));
}

const timedFetch = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });

export async function gatherSources(comp, { serpApiKey = null, fetchImpl = timedFetch } = {}) {
  const queries = (comp.watch_queries || []).filter(Boolean).slice(0, MAX_QUERIES);
  if (!queries.length) queries.push(`${comp.name} new feature launch`);
  const seen = new Set();
  const sources = [];
  const notes = [];
  let returned = 0;
  for (const query of queries) {
    const { results, provider, note } = await webSearch({ serpApiKey, query, num: 6, fetchImpl });
    notes.push(`${provider}${note ? ` (${note})` : ''}`);
    returned += results.length;
    for (const row of results) {
      if (!row.link || seen.has(row.link)) continue;
      seen.add(row.link);
      if (mentionsCompetitor(comp, row)) sources.push(row);
    }
  }
  return { sources: sources.slice(0, MAX_SOURCES), queries, returned, notes };
}

// ── model call + validation ───────────────────────────────────────────────────

export function parseJsonObject(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the model reply');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function buildGapPrompt(comp, registry, sources, recentGaps = []) {
  const { leads, axonLeads } = baselineGapSummary(comp, registry);
  const sourceBlock = sources
    .map((s, i) => `${i + 1}. ${clip(s.title, 200)}\n   ${s.link}\n   ${clip(s.snippet, 300)}`)
    .join('\n\n');
  return `Competitor: ${comp.name}
Category: ${comp.category}
Registry note (our own baseline, not a source): strengths ${(comp.strengths || []).join('; ') || 'none listed'}; they lead on ${leads.join(', ') || 'nothing flagged'}; AXON is already ahead on ${axonLeads.slice(0, 5).join(', ') || 'see registry'}.
${recentGaps.length ? `Already reported by the daily research lane, do not repeat these:\n${recentGaps.map((g) => `- ${g}`).join('\n')}\n` : ''}
Sources (the ONLY facts you may use):
${sourceBlock}

Find ONE specific capability ${comp.name} has that AXON does not have yet, shown by at least one source above.
If the sources do not show a concrete gap, return {"no_gap": true, "reason": "one sentence"} instead of guessing.
Otherwise return JSON only:
{
  "gap": "one sentence: the specific thing they have that AXON lacks",
  "why_it_matters": "one sentence: what this gap costs AXON/NVG",
  "threat": "one sentence: what they expose or what moved",
  "pivot": "one sentence: how AXON pushes past it, offensive and specific",
  "build_plan": {
    "what_to_build": "concrete: a feature, a pipeline, an integration",
    "steps": ["step 1", "step 2", "step 3"],
    "effort": "small|medium|large",
    "priority": "high|medium|low"
  },
  "plain_english": "1-2 sentences, no jargon: what this gap is and what closing it gets AXON",
  "source_urls": ["copy the supporting URLs exactly from the Sources list"]
}`;
}

/**
 * Accept a gap plan only if every field is there and it cites a source that was really
 * fetched. Anything else is rejected, never repaired: a repaired plan is a made-up plan.
 */
export function validateGapPlan(raw, sources) {
  if (!raw || typeof raw !== 'object') return { ok: false, kind: 'invalid', reason: 'reply was not a JSON object' };
  if (raw.no_gap === true) return { ok: false, kind: 'no_gap', reason: clip(raw.reason, 240) || 'sources show no concrete gap' };
  const gap = clip(raw.gap, 300);
  const why = clip(raw.why_it_matters, 300);
  const plain = clip(raw.plain_english, 300);
  const bp = raw.build_plan || {};
  const what = clip(bp.what_to_build, 400);
  const steps = (Array.isArray(bp.steps) ? bp.steps : []).map((s) => clip(s, 200)).filter(Boolean).slice(0, 6);
  const effort = String(bp.effort || '').toLowerCase().trim();
  const priority = String(bp.priority || '').toLowerCase().trim();
  const missing = [];
  if (!gap) missing.push('gap');
  if (!why) missing.push('why_it_matters');
  if (!plain) missing.push('plain_english');
  if (!what) missing.push('build_plan.what_to_build');
  if (!steps.length) missing.push('build_plan.steps');
  if (!EFFORTS.includes(effort)) missing.push('build_plan.effort');
  if (!PRIORITIES.includes(priority)) missing.push('build_plan.priority');
  if (missing.length) return { ok: false, kind: 'invalid', reason: `missing or invalid: ${missing.join(', ')}` };
  // a trailing slash dropped by the model is still the same fetched source; return the fetched form
  const norm = (u) => String(u).trim().replace(/\/+$/, '');
  const known = new Map(sources.map((s) => [norm(s.link), s.link]));
  const cited = [...new Set((Array.isArray(raw.source_urls) ? raw.source_urls : []).map((u) => known.get(norm(u))).filter(Boolean))];
  if (!cited.length) return { ok: false, kind: 'ungrounded', reason: 'plan cited no source that was actually fetched' };
  return {
    ok: true,
    plan: {
      gap,
      why_it_matters: why,
      threat: clip(raw.threat, 300) || null,
      pivot: clip(raw.pivot, 300) || null,
      build_plan: { what_to_build: what, steps, effort, priority },
      plain_english: plain,
      source_urls: cited,
    },
  };
}

/**
 * One competitor, start to finish. status: plan | no_source | no_gap | no_plan.
 * no_source and no_plan are retried next run; neither ever carries a plan field.
 */
export async function scanCompetitor(comp, ctx) {
  const { registry, supabaseKey, recentGaps = [], generate = generateViaRouter, maxAttempts = 2, retryDelayMs = 2000 } = ctx;
  const found = await gatherSources(comp, ctx);
  const base = { competitor: comp.name, category: comp.category, url: comp.url, queries: found.queries, search_notes: found.notes, sources: found.sources };
  if (!found.sources.length) {
    return {
      ...base,
      status: 'no_source',
      reason: found.returned
        ? `web search returned ${found.returned} result(s) but none mention ${comp.name}`
        : `web search returned nothing for ${found.queries.length} quer${found.queries.length === 1 ? 'y' : 'ies'} (${found.notes.join('; ')})`,
    };
  }

  const prompt = buildGapPrompt(comp, registry, found.sources, recentGaps);
  const errors = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = await generate(supabaseKey, {
        system: SYSTEM_PROMPT,
        user: prompt,
        kind: 'reasoning_planning',
        agentName: JOB_ID,
        maxTokens: 1100,
        jsonMode: true,
      });
      const verdict = validateGapPlan(parseJsonObject(out.text), found.sources);
      const who = { provider: out.source || out.provider || null, model: out.model || null };
      if (verdict.ok) return { ...base, status: 'plan', plan: verdict.plan, ...who };
      if (verdict.kind === 'no_gap') return { ...base, status: 'no_gap', reason: verdict.reason, ...who };
      errors.push(`attempt ${attempt}/${maxAttempts}: ${verdict.reason}`);
    } catch (err) {
      errors.push(`attempt ${attempt}/${maxAttempts}: ${err.message}`);
    }
    if (attempt < maxAttempts) await sleep(retryDelayMs);
  }
  return { ...base, status: 'no_plan', reason: 'real sources found but no usable gap plan came back', errors };
}

// ── retry carry-over (loop note) ──────────────────────────────────────────────

export function encodeCarry(items) {
  return `retry-first: ${items.map((i) => `${i.name}(${i.streak})`).join('; ')}`;
}

/** Read "retry-first: A(1); B(0)" back out of the last loop note. Unknown names are dropped by pickCompetitors. */
export function decodeCarry(text) {
  const m = String(text || '').match(/retry-first:\s*(.+?)(?=\s\|\s|\s—\s|$)/);
  if (!m) return [];
  return m[1]
    .split(';')
    .map((part) => part.trim().match(/^(.*?)(?:\((\d+)\))?$/))
    .filter((p) => p && p[1])
    .map((p) => ({ name: p[1].trim(), streak: Number(p[2] || 0) }));
}

export function nextCarry({ scans, unreached = [], carryIn = [] }) {
  const prior = new Map(carryIn.map((c) => [c.name.toLowerCase(), c.streak]));
  const carry = unreached.map((name) => ({ name, streak: prior.get(name.toLowerCase()) ?? 0 }));
  const dropped = [];
  for (const s of scans) {
    if (s.status !== 'no_source' && s.status !== 'no_plan') continue;
    const streak = (prior.get(s.competitor.toLowerCase()) ?? 0) + 1;
    (streak >= MAX_RETRY_STREAK ? dropped : carry).push({ name: s.competitor, streak });
  }
  return { carry, dropped };
}

// ── report ────────────────────────────────────────────────────────────────────

const RETRY_STATUSES = ['no_source', 'no_plan'];

export function buildReport({ date, registry, scans, stoppedEarlyBefore = null, latest = false }) {
  const title = `AXON Competitor Scan — ${date}`;
  const plans = scans.filter((s) => s.status === 'plan');
  const retry = scans.filter((s) => RETRY_STATUSES.includes(s.status));
  const lines = [
    '---',
    `type: ${latest ? 'moc' : 'log'}`,
    `title: ${title}`,
    'status: active',
    `canonical: ${latest ? 'true' : 'false'}`,
    `updated: ${date}`,
    'superseded_by:',
    'owner: JB',
    'tags: [axon, competitive]',
    '---',
    `# ${title}`,
    '',
    '> **NVG posture:** Threat → Pivot → Push. See [[Competitive Posture — Threat to Pivot|Competitive Posture]].',
    '',
    `**Scanned today:** ${scans.map((s) => s.competitor).join(', ') || 'none'}`,
    `**Real gap plans:** ${plans.length} · **No plan this run, retry next run:** ${retry.length}` +
      (stoppedEarlyBefore ? ` · **Stopped early before:** ${stoppedEarlyBefore} (time budget, carried to the next run)` : ''),
    '',
    "## Today's pivot summary",
    '',
    ...(plans.length
      ? plans.map((p) => `- **${p.competitor}:** ${p.plan.pivot || p.plan.build_plan.what_to_build}`)
      : ['- No real gap plan today. Nothing was invented, see each competitor below for what came back.']),
    '',
  ];

  for (const s of scans) {
    const comp = registry.competitors.find((c) => c.name === s.competitor) || {};
    const { leads, axonLeads } = baselineGapSummary(comp, registry);
    lines.push(`## ${s.competitor} (${s.category})`);
    lines.push(`- **URL:** ${s.url || 'n/a'}`);
    lines.push(`- **Registry threat level:** ${comp.threat || 'n/a'}`);
    lines.push(`- **They lead on (registry baseline, updated ${registry.updated || 'n/a'}):** ${leads.length ? leads.join(', ') : 'none flagged'}`);
    lines.push(`- **AXON moat axes:** ${axonLeads.length ? axonLeads.slice(0, 5).join(', ') : 'see Competitor Gap Register'}`);
    lines.push('');
    lines.push('### Sources');
    if (s.sources.length) for (const src of s.sources) lines.push(`- [${mdText(src.title)}](${mdLink(src.link)})${src.source ? ` — ${mdText(src.source)}` : ''}`);
    else lines.push('- None. No real source came back this run.');
    lines.push('');
    if (s.status === 'plan') {
      const p = s.plan;
      lines.push('### Threat', p.threat || p.why_it_matters, '');
      lines.push('### Pivot', p.pivot || p.build_plan.what_to_build, '');
      lines.push('### Gap → Build plan');
      lines.push(`- **Gap:** ${p.gap}`);
      lines.push(`- **Why it matters:** ${p.why_it_matters}`);
      lines.push(`- **Build:** ${p.build_plan.what_to_build} (effort: ${p.build_plan.effort}, priority: ${p.build_plan.priority})`);
      p.build_plan.steps.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
      lines.push(`- **In plain English:** ${p.plain_english}`);
      lines.push(`- **Cited:** ${p.source_urls.join(', ')}`);
      lines.push('', `<!-- analysis-source: ${s.provider || 'unknown'}${s.model ? ` (${s.model})` : ''} -->`);
    } else if (s.status === 'no_source') {
      lines.push('### Result', `No real source this run (${s.reason}). Nothing was invented. Will retry next run.`);
    } else if (s.status === 'no_gap') {
      lines.push('### Result', `Real sources found, but none show a concrete capability gap (${s.reason}). Nothing was invented. Stays in the normal rotation.`);
    } else {
      lines.push('### Result', `Real sources found, but ${s.reason}. No stand-in plan was written. Will retry next run.`);
      for (const e of (s.errors || []).slice(0, 2)) lines.push(`- ${mdText(e)}`);
    }
    lines.push('');
  }

  lines.push('---', '## References', '- [[Competitor Gap Register]]', `- \`competitor-registry.json\` (updated ${registry.updated || 'n/a'})`, '');
  return lines.join('\n');
}

/** Dated file (-2, -3 for a same-day resume run) plus LATEST.md. Returns paths relative to the vault root too. */
export function writeReport(vaultRoot, date, bodyFor) {
  const dir = path.join(vaultRoot, INTEL_DIR_REL);
  fs.mkdirSync(dir, { recursive: true });
  let datedPath = path.join(dir, `${date}.md`);
  for (let n = 2; fs.existsSync(datedPath); n++) datedPath = path.join(dir, `${date}-${n}.md`);
  const latestPath = path.join(dir, 'LATEST.md');
  fs.writeFileSync(datedPath, bodyFor(false));
  fs.writeFileSync(latestPath, bodyFor(true));
  return { datedPath, latestPath, relPath: path.join(INTEL_DIR_REL, path.basename(datedPath)) };
}

/** Where the report would land (read-only, used by --dry-run). */
export function plannedReportPath(vaultRoot, date) {
  const dir = path.join(vaultRoot, INTEL_DIR_REL);
  let p = path.join(dir, `${date}.md`);
  for (let n = 2; fs.existsSync(p); n++) p = path.join(dir, `${date}-${n}.md`);
  return { datedPath: p, latestPath: path.join(dir, 'LATEST.md') };
}

// ── bus hand-off ──────────────────────────────────────────────────────────────

export function buildBusMessage({ date, scans, stoppedEarlyBefore = null, reportRelPath = null }) {
  const plans = scans.filter((s) => s.status === 'plan');
  const noSource = scans.filter((s) => s.status === 'no_source');
  const noPlan = scans.filter((s) => s.status === 'no_plan');
  const summary = [
    ...plans.map((s) => `${s.competitor}: ${s.plan.plain_english}`),
    ...noSource.map((s) => `${s.competitor}: no real source today, will retry next run`),
    ...noPlan.map((s) => `${s.competitor}: found sources but no usable plan today, will retry next run`),
  ].join(' | ');
  return {
    fromAgent: AGENT.COMPETITOR_SCAN,
    toAgent: AGENT.EXECUTIVE_AGENT,
    subject: `COMPETITOR-SCAN-GAP-PLANS-${date.replace(/-/g, '')}`,
    needsAnswer: plans.length > 0, // nothing to answer when no plan was produced
    body: {
      kind: 'competitor_gap_build_plans',
      date,
      stopped_early_before: stoppedEarlyBefore,
      report_path: reportRelPath,
      plain_english_summary: summary || 'No competitor was scanned this run.',
      plans: plans.map((s) => ({
        competitor: s.competitor,
        gap: s.plan.gap,
        why_it_matters: s.plan.why_it_matters,
        threat: s.plan.threat,
        pivot: s.plan.pivot,
        build_plan: s.plan.build_plan,
        plain_english: s.plan.plain_english,
        source_urls: s.plan.source_urls,
        provider: s.provider,
      })),
      no_source: noSource.map((s) => ({ competitor: s.competitor, reason: s.reason })),
      no_plan: noPlan.map((s) => ({ competitor: s.competitor, reason: s.reason })),
    },
  };
}

// ── dry run ───────────────────────────────────────────────────────────────────

export function planDryRun({ now, vaultRoot, registry, registryFile, perRun, budgetMs }) {
  const pool = competitorPool(registry);
  const picked = pickCompetitors(pool, { date: now, count: perRun });
  const date = dayStamp(now);
  const { datedPath, latestPath } = plannedReportPath(vaultRoot, date);
  const lines = [
    'AXON competitor scan: DRY RUN (no network calls, no model calls, no database writes)',
    `Date: ${date} (rotation step ${rotationOrdinal(now)})`,
    `Registry: ${registryFile} (${pool.length} competitors in rotation, registry updated ${registry.updated || 'n/a'})`,
    `Would scan (${perRun} per run): ${picked.map((c) => c.name).join(', ')}`,
    '  plus any competitor the last run left to retry (needs the database, not read in dry-run)',
    ...picked.map((c) => `  ${c.name}: searches [${(c.watch_queries || []).slice(0, MAX_QUERIES).join(' | ') || `${c.name} new feature launch`}], keep results that name them, one model call through the router chain`),
    `Would write report: ${datedPath}`,
    `Would update: ${latestPath}`,
    'Would hand gap plans to AXON Executive over agent_bus (needs_answer=true when at least one plan)',
    `Would flag a resume within ${RESUME_HOURS}h if the ${Math.round(budgetMs / 1000)}s time budget is hit`,
    'Would write a loop-engineering note (what worked, what broke, who to retry first)',
  ];
  return { lines, picked: picked.map((c) => c.name), datedPath, latestPath, date };
}

// ── run ───────────────────────────────────────────────────────────────────────

async function readRecentLaneGaps(sbSelect) {
  try {
    const rows = await sbSelect(
      'axon_research_findings',
      `research_lane=eq.${COMPETITOR_LANE_ID}&status=neq.skipped&order=created_at.desc&limit=8&select=title,summary`,
    );
    return (rows || []).map((r) => clip(r.summary || r.title, 160)).filter(Boolean);
  } catch {
    return []; // dedupe is best-effort, a failed read must not stop the scan
  }
}

/**
 * Everything injectable (sb, generate, fetchImpl, budgetCheck, now) so the tests run offline.
 * Real runs go through main() below.
 */
export async function runCompetitorScan(opts) {
  const {
    now = new Date(),
    vaultRoot,
    registry,
    registryFile = path.join(vaultRoot, INTEL_DIR_REL, REGISTRY_FILE),
    sb,
    supabaseKey,
    serpApiKey = null,
    generate = generateViaRouter,
    fetchImpl,
    budgetCheck = () => false,
    perRun = DEFAULT_PER_RUN,
    budgetMs = DEFAULT_BUDGET_MS,
    retryDelayMs,
    dryRun = false,
    log = console.log,
  } = opts;

  if (dryRun) {
    const plan = planDryRun({ now, vaultRoot, registry, registryFile, perRun, budgetMs });
    plan.lines.forEach((l) => log(l));
    return { dryRun: true, ...plan };
  }

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return { skipped: true, reason: 'disabled in axon_cron_jobs' };

  const date = dayStamp(now);
  const lastLoop = await readLastLoopNote(sb.sbSelect, JOB_ID);
  if (lastLoop) log(`Loop-engineering carry-forward: ${lastLoop.learning}`);
  else log('Loop-engineering: no prior note found, first run in this mode.');
  const carryIn = decodeCarry(lastLoop?.learning);
  const recentGaps = await readRecentLaneGaps(sb.sbSelect);
  const pool = competitorPool(registry);
  const picked = pickCompetitors(pool, { date: now, count: perRun, carry: carryIn });
  log(`AXON competitor scan ${date}: ${picked.map((c) => c.name).join(', ')}`);

  const scans = [];
  let stoppedEarlyBefore = null;
  let unreached = [];
  try {
    for (let i = 0; i < picked.length; i++) {
      if (budgetCheck()) {
        stoppedEarlyBefore = picked[i].name;
        unreached = picked.slice(i).map((c) => c.name);
        log(`Time budget hit before "${stoppedEarlyBefore}", will resume next run.`);
        break;
      }
      log(`Scanning ${picked[i].name}`);
      scans.push(await scanCompetitor(picked[i], { registry, supabaseKey, serpApiKey, fetchImpl, generate, recentGaps, retryDelayMs }));
      log(`  -> ${scans[scans.length - 1].status}`);
    }
  } catch (err) {
    // keep the retry list alive across a crash, the next run reads this note
    const keep = new Map([...picked.map((c) => [c.name, { name: c.name, streak: 0 }]), ...carryIn.map((c) => [c.name, c])]);
    await writeLoopNote(sb.sbInsert, JOB_ID, {
      didntWork: [`run crashed: ${clip(err.message, 160)}`],
      applyNext: [encodeCarry([...keep.values()])],
    });
    throw err;
  }

  const bodyFor = (latest) => buildReport({ date, registry, scans, stoppedEarlyBefore, latest });
  let report = null;
  let reportError = null;
  try {
    report = writeReport(vaultRoot, date, bodyFor);
    log(`Wrote ${report.datedPath}`);
  } catch (err) {
    reportError = err.message;
    log(`Report write failed: ${err.message}`);
  }

  if (stoppedEarlyBefore) {
    await flagResumeNeeded(sb.sbSelect, sb.sbPatch, JOB_ID, `Stopped before "${stoppedEarlyBefore}", time budget hit mid-run.`, RESUME_HOURS);
  } else {
    await clearResumeFlag(sb.sbSelect, sb.sbPatch, JOB_ID);
  }

  let bus = null;
  if (scans.length) {
    const msg = buildBusMessage({ date, scans, stoppedEarlyBefore, reportRelPath: report?.relPath || null });
    bus = await handoffToAgent(sb.sbInsert, msg);
  }

  const { carry, dropped } = nextCarry({ scans, unreached, carryIn });
  const plans = scans.filter((s) => s.status === 'plan');
  const loopNote = await writeLoopNote(sb.sbInsert, JOB_ID, {
    worked: [
      ...plans.map((s) => `${s.competitor} via ${s.provider}`),
      ...scans.filter((s) => s.status === 'no_gap').map((s) => `${s.competitor}: real sources, no concrete gap`),
    ],
    didntWork: [
      ...scans.filter((s) => s.status === 'no_source').map((s) => `${s.competitor}: no real source (${s.reason})`),
      ...scans.filter((s) => s.status === 'no_plan').map((s) => `${s.competitor}: sources found, no usable plan (${(s.errors || []).slice(-1)[0] || s.reason})`),
      ...(scans.length && !bus ? ['agent_bus hand-off failed'] : []),
      ...(reportError ? [`report write failed: ${clip(reportError, 120)}`] : []),
    ],
    applyNext: [
      ...(carry.length ? [encodeCarry(carry)] : []),
      ...dropped.map((d) => `${d.name}: nothing real ${MAX_RETRY_STREAK} runs in a row, refresh its watch queries in the registry`),
    ],
  });

  log(`Done: ${plans.length} gap plan(s), ${scans.length - plans.length} without a plan${stoppedEarlyBefore ? `, stopped before ${stoppedEarlyBefore}` : ''}.`);
  return { date, picked: picked.map((c) => c.name), scans, stoppedEarlyBefore, report, reportError, bus, carry, dropped, loopNote };
}

const USAGE = 'Usage: node scripts/axon-competitor-scan.mjs [--dry-run] [--date=YYYY-MM-DD]';

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv, env);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.unknown.length) {
    console.error(`Unknown option ${args.unknown[0]}. ${USAGE}`);
    return 2;
  }
  let now = new Date();
  if (args.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || Number.isNaN(Date.parse(`${args.date}T12:00:00Z`))) {
      console.error(`--date must look like 2026-10-07, got "${args.date}".`);
      return 2;
    }
    now = new Date(`${args.date}T12:00:00Z`);
  }
  const vaultRoot = resolveVaultRoot(env);
  const perRun = Math.min(5, Math.max(1, Number(env.AXON_COMPSCAN_PER_RUN) || DEFAULT_PER_RUN));
  const budgetMs = Math.max(60_000, Number(env.AXON_COMPSCAN_TIME_BUDGET_MS) || DEFAULT_BUDGET_MS);

  if (args.dryRun) {
    const { registry, file } = loadRegistry(vaultRoot);
    await runCompetitorScan({ dryRun: true, now, vaultRoot, registry, registryFile: file, perRun, budgetMs });
    return 0;
  }

  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '';
  if (!supabaseKey) {
    console.error('AXON competitor scan needs SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) in the environment and neither is set.');
    return 2;
  }
  const { registry, file } = loadRegistry(vaultRoot);
  const sb = createSupabaseClient(supabaseKey);
  const serpApiKey = await resolveSerpKey(env, sb.sbSelect);
  const startedAt = Date.now();
  try {
    await runCompetitorScan({
      now, vaultRoot, registry, registryFile: file, sb, supabaseKey, serpApiKey, perRun, budgetMs,
      budgetCheck: () => Date.now() - startedAt > budgetMs,
    });
    return 0;
  } catch (err) {
    console.error(`AXON competitor scan failed: ${err.message}`);
    await handoffToAgent(sb.sbInsert, {
      fromAgent: AGENT.COMPETITOR_SCAN,
      toAgent: AGENT.EXECUTIVE_AGENT,
      subject: `COMPETITOR-SCAN-FAILED-${dayStamp(now).replace(/-/g, '')}`,
      body: { kind: 'competitor_scan_failed', date: dayStamp(now), error: clip(err.message, 300) },
      needsAnswer: false,
    });
    return 1;
  }
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((err) => {
      console.error(`AXON competitor scan failed: ${err.message}`);
      process.exitCode = 1;
    });
}
