/**
 * AX-MODEL-DAILY — local daily model build + Phase 1 scoring loop.
 *
 * Prefers Ollama on JB's Mac when available; falls back to a deterministic
 * heuristic scorer so dry-runs and CI stay green without a local LLM.
 *
 * Phase 1 goal: move outreach/follow-up scoring interactivity into AXON and
 * reduce paid API spend for routine calibration loops.
 */

import { MIN_OUTREACH_SCORE, SCORE_RUBRIC, todayUtc } from './constants.mjs';
import { ICP_EXCLUSIONS, ICP_SEGMENTS } from './icp-config.mjs';

export const OLLAMA_BASE_DEFAULT = 'http://127.0.0.1:11434';
export const OLLAMA_MODEL_DEFAULT = process.env.OLLAMA_MODEL || 'llama3.2';
export const LOCAL_MODEL_RUN_TABLE = 'axon_local_model_runs';

/** @typedef {{ available: boolean; base: string; models: string[]; error?: string }} OllamaProbe */

/**
 * Probe local Ollama without throwing.
 * @param {{ base?: string; fetchImpl?: typeof fetch; timeoutMs?: number }} [opts]
 * @returns {Promise<OllamaProbe>}
 */
export async function probeOllama(opts = {}) {
  const base = (opts.base || process.env.OLLAMA_HOST || OLLAMA_BASE_DEFAULT).replace(/\/$/, '');
  const fetchImpl = opts.fetchImpl || fetch;
  const timeoutMs = opts.timeoutMs ?? 1500;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`${base}/api/tags`, { signal: ctrl.signal });
    if (!r.ok) {
      return { available: false, base, models: [], error: `HTTP ${r.status}` };
    }
    const data = await r.json();
    const models = (data.models || []).map((m) => m.name).filter(Boolean);
    return { available: true, base, models };
  } catch (err) {
    return {
      available: false,
      base,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function textBlob(lead) {
  return [
    lead.handle,
    lead.niche,
    lead.target_group,
    lead.why_match_fit,
    lead.comment_draft,
    lead.dm_draft,
    lead.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasExclusionHit(blob) {
  const phrases = [
    ...ICP_EXCLUSIONS.entityTypes,
    ...ICP_EXCLUSIONS.titlePhrases,
  ].map((p) => p.toLowerCase());
  return phrases.some((p) => blob.includes(p));
}

function industryHit(blob) {
  const industries = [
    ...ICP_SEGMENTS.smb.industries,
    ...ICP_SEGMENTS.enterprise.industries,
  ].map((i) => i.toLowerCase());
  return industries.filter((i) => blob.includes(i.split(' ')[0])).length;
}

/**
 * Deterministic heuristic scorer — used when Ollama is offline / dry path.
 * @param {Record<string, unknown>} lead
 * @param {{ topRejectReasons?: Array<{ reason: string }> }} [training]
 */
export function heuristicScoreLead(lead, training = {}) {
  const blob = textBlob(lead);
  if (hasExclusionHit(blob)) {
    return {
      score: 0,
      provider: 'heuristic',
      why: 'Exclusion phrase match (job board / recruiter / aggregator)',
      queue: false,
    };
  }

  let score = 35;
  const industryMatches = industryHit(blob);
  score += Math.min(30, industryMatches * 10);

  if (/(ops|operation|workflow|manual|compliance|scale|back.?office)/.test(blob)) {
    score += 18;
  } else if (blob.length > 80) {
    score += 8;
  }

  if (/(founder|coo|operations|ops manager|office manager|vp operations)/.test(blob)) {
    score += 12;
  }

  if (/(smb|small|clinic|broker|dental|freight|accounting)/.test(blob)) {
    score += 8;
  }

  const rejectReasons = (training.topRejectReasons || []).map((r) =>
    String(r.reason || '').toLowerCase(),
  );
  for (const reason of rejectReasons) {
    if (reason && blob.includes(reason.slice(0, 24))) {
      score -= 15;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    provider: 'heuristic',
    why: `Heuristic ICP fit ≈ ${score}/100 (industry=${industryMatches})`,
    queue: score >= MIN_OUTREACH_SCORE,
  };
}

/**
 * Ask Ollama to score a lead. Falls back to heuristic on parse/network failure.
 * @param {Record<string, unknown>} lead
 * @param {{ topRejectReasons?: Array<{ reason: string }> }} training
 * @param {{ base: string; model: string; fetchImpl?: typeof fetch }} ollama
 */
export async function ollamaScoreLead(lead, training, ollama) {
  const fetchImpl = ollama.fetchImpl || fetch;
  const rejectBlock = (training.topRejectReasons || [])
    .slice(0, 5)
    .map((r) => `- ${r.reason}`)
    .join('\n');

  const prompt = `You are AXON local scorer for NORTHSiDE Intelligence Phase 1 outreach.
Brand: NORTHSiDE. Score 0-100. Never draft spammy copy here — score only.

${SCORE_RUBRIC}

Operator reject patterns to honor:
${rejectBlock || '(none yet)'}

Lead JSON:
${JSON.stringify(
  {
    handle: lead.handle,
    niche: lead.niche,
    target_group: lead.target_group,
    why_match_fit: lead.why_match_fit,
    status: lead.status,
  },
  null,
  2,
)}

Return JSON only: { "score": 0-100, "why": "one sentence" }`;

  try {
    const r = await fetchImpl(`${ollama.base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ollama.model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }),
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const data = await r.json();
    const raw = String(data.response || '');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in Ollama response');
    const parsed = JSON.parse(match[0]);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    return {
      score,
      provider: 'ollama',
      why: String(parsed.why || 'Local model score'),
      queue: score >= MIN_OUTREACH_SCORE,
    };
  } catch {
    const fallback = heuristicScoreLead(lead, training);
    return { ...fallback, provider: 'heuristic_fallback' };
  }
}

/**
 * Build the daily local model training pack from outreach signals.
 * @param {Array<Record<string, unknown>>} signals
 * @param {Array<Record<string, unknown>>} leads
 */
export function buildDailyDataset(signals = [], leads = []) {
  const rejectReasons = [];
  const draftEdits = [];
  for (const s of signals) {
    if (s.field_name === 'reject_reason' || s.field_name === 'auto_reject' || s.field_name === 'icp_drop') {
      if (s.after_value) rejectReasons.push(String(s.after_value));
    }
    if (['email_subject', 'comment_draft', 'dm_draft'].includes(String(s.field_name))) {
      draftEdits.push({
        field: s.field_name,
        before: s.before_value,
        after: s.after_value,
      });
    }
  }

  return {
    dayKey: todayUtc(),
    signalCount: signals.length,
    leadCount: leads.length,
    rejectReasons: rejectReasons.slice(0, 20),
    draftEdits: draftEdits.slice(0, 20),
    phase1: {
      goal: 'Close 4 paid NI Services clients',
      pipeline: ['find', 'score', 'draft', 'approve', 'send', 'follow-up', 'close'],
      interactivity:
        'Daily outreach and follow-up workflows run inside AXON (local score + HQ) to cut paid API/subscription usage.',
    },
  };
}

/**
 * Score a batch of leads with Ollama or heuristic.
 * @param {object} opts
 */
export async function scoreLeadBatch(opts) {
  const {
    leads = [],
    training = {},
    probe,
    model = OLLAMA_MODEL_DEFAULT,
    preferHeuristic = false,
    fetchImpl,
    limit = 25,
  } = opts;

  const slice = leads.slice(0, limit);
  const results = [];
  const useOllama = !preferHeuristic && probe?.available;

  for (const lead of slice) {
    const scored = useOllama
      ? await ollamaScoreLead(lead, training, {
          base: probe.base,
          model,
          fetchImpl,
        })
      : heuristicScoreLead(lead, training);
    results.push({
      id: lead.id,
      handle: lead.handle,
      status: lead.status,
      ...scored,
    });
  }

  const avg =
    results.length === 0
      ? null
      : Math.round((results.reduce((sum, r) => sum + r.score, 0) / results.length) * 10) / 10;

  return {
    provider: useOllama ? 'ollama' : preferHeuristic ? 'heuristic' : 'heuristic',
    model: useOllama ? model : null,
    scored: results,
    avgScore: avg,
    queueable: results.filter((r) => r.queue).length,
  };
}

/**
 * Full daily run — probe, build dataset, score, optionally persist.
 * @param {object} opts
 */
export async function runLocalModelDaily(opts = {}) {
  const {
    signals = [],
    leads = [],
    training = {},
    dryRun = process.env.AXON_DRY_RUN === '1',
    forceHeuristic = process.env.AXON_LOCAL_MODEL_HEURISTIC === '1',
    ollamaBase,
    model = OLLAMA_MODEL_DEFAULT,
    fetchImpl,
    persist,
    operatorId = 'default',
    limit = 25,
  } = opts;

  const probe = await probeOllama({ base: ollamaBase, fetchImpl });
  const dataset = buildDailyDataset(signals, leads);
  const preferHeuristic = forceHeuristic || !probe.available;
  const batch = await scoreLeadBatch({
    leads,
    training,
    probe,
    model,
    preferHeuristic,
    fetchImpl,
    limit,
  });

  const summary = preferHeuristic
    ? `Local daily model build (heuristic${probe.available ? '' : ' — Ollama offline'}): scored ${batch.scored.length} leads, avg ${batch.avgScore ?? 'n/a'}, ${batch.queueable} queueable. Phase 1 workflow interactivity stays in AXON.`
    : `Local daily model build (Ollama ${model}): scored ${batch.scored.length} leads, avg ${batch.avgScore ?? 'n/a'}, ${batch.queueable} queueable.`;

  const record = {
    operator_id: operatorId,
    day_key: dataset.dayKey,
    provider: batch.provider,
    model_name: batch.model,
    dry_run: dryRun,
    leads_scored: batch.scored.length,
    signals_used: signals.length,
    avg_score: batch.avgScore,
    summary,
    meta: {
      ollama: { available: probe.available, base: probe.base, models: probe.models.slice(0, 8) },
      phase1: dataset.phase1,
      sample: batch.scored.slice(0, 5),
      brand: 'NORTHSiDE',
    },
  };

  let persisted = null;
  if (!dryRun && typeof persist === 'function') {
    persisted = await persist(record);
  }

  return {
    ok: true,
    dryRun,
    probe,
    dataset,
    batch,
    record,
    persisted,
    summary,
  };
}

/**
 * Format a Mac launchd/cron checklist for JB.
 */
export function macCronChecklist({ repoPath = '~/Projects/AXON' } = {}) {
  return [
    'Install Ollama + pull a small model: `ollama pull llama3.2`',
    `Clone/update AXON at ${repoPath} and copy .env.example → .env (SUPABASE_SERVICE_KEY)`,
    `Dry-run once: cd ${repoPath} && AXON_DRY_RUN=1 npm run model:daily`,
    'Confirm output shows heuristic or ollama provider without crashes',
    `Install daily cron (7:00 AM local): 0 7 * * * cd ${repoPath} && /usr/bin/npm run model:daily >>/tmp/axon-model-daily.log 2>&1`,
    'Optional launchd: KeepAlive=false, StartCalendarInterval hour=7',
    'Verify NI-Brain table axon_local_model_runs receives rows after live run',
    'Phase 1 interactivity: open NI Outreach HQ → use the Phase 1 workflow strip (find→close)',
  ];
}
