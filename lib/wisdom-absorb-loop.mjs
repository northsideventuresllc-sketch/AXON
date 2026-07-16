/**
 * AX-WISDOM-LOOP — Watch → digest → enhance → absorb.
 *
 * Pulls ND corpus, research findings, Learnings, and communication signals,
 * digests them into ranked wisdom units, enhances J-space / prompt blocks,
 * and absorbs into NI-Brain (`axon_wisdom_items` + `axon_wisdom_runs`).
 *
 * Heuristic path is default (CI / Mac dry-run without paid API). Optional Haiku
 * polish when ANTHROPIC_API_KEY is present and forceHeuristic is false.
 *
 * Brand: NORTHSiDE · Operator: JB
 */

import { createHash } from 'node:crypto';
import { HAIKU_MODEL, todayUtc } from './constants.mjs';
import { postConcept, broadcastWorkspace } from './axon-j-space-core.mjs';

export const WISDOM_ITEMS_TABLE = 'axon_wisdom_items';
export const WISDOM_RUNS_TABLE = 'axon_wisdom_runs';
export const WISDOM_MAX_ABSORB = 12;
export const WISDOM_MAX_ENHANCE = 6;

/**
 * @typedef {{
 *   id?: string;
 *   fingerprint: string;
 *   title: string;
 *   principle: string;
 *   application: string;
 *   domain: string;
 *   source_type: string;
 *   source_ref: string | null;
 *   confidence: string;
 *   salience: number;
 *   meta?: Record<string, unknown>;
 * }} WisdomItem
 */

/** Stable fingerprint for dedupe across absorb cycles. */
export function wisdomFingerprint(title, principle) {
  const raw = `${String(title || '').trim().toLowerCase()}|${String(principle || '').trim().toLowerCase()}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

function clip(text, n = 280) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

function confidenceWeight(confidence) {
  const c = String(confidence || '').toLowerCase();
  if (c === 'verified' || c === 'high') return 3;
  if (c === 'provisional' || c === 'medium') return 2;
  return 1;
}

function sourceWeight(sourceType) {
  switch (sourceType) {
    case 'learning':
      return 3.2; // JB corrections / preferences win
    case 'nd_corpus':
      return 2.6;
    case 'research':
      return 2.2;
    case 'signal':
      return 1.6;
    default:
      return 1;
  }
}

/**
 * Score salience for competitive absorb (workspace bottleneck analogue).
 * @param {WisdomItem} item
 */
export function scoreSalience(item) {
  const base =
    sourceWeight(item.source_type) +
    confidenceWeight(item.confidence) +
    (item.application ? 0.8 : 0) +
    Math.min(1.2, (item.principle?.length || 0) / 180);
  return Math.round(base * 10) / 10;
}

/**
 * WATCH — normalize heterogeneous NI-Brain rows into watch events.
 * @param {{
 *   corpus?: Array<Record<string, unknown>>;
 *   findings?: Array<Record<string, unknown>>;
 *   learnings?: Array<Record<string, unknown>>;
 *   signals?: Array<Record<string, unknown>>;
 * }} sources
 */
export function watchSources(sources = {}) {
  const events = [];

  for (const row of sources.corpus || []) {
    const title = String(row.title || row.external_id || 'ND source');
    const principle = String(row.key_finding || '').trim();
    if (!principle) continue;
    events.push({
      source_type: 'nd_corpus',
      source_ref: String(row.external_id || row.id || ''),
      title,
      principle,
      application: String(row.axon_application || ''),
      domain: String(row.domain || 'nd'),
      confidence: String(row.confidence || 'provisional'),
      meta: { source_type_row: row.source_type || null, year: row.year || null },
    });
  }

  for (const row of sources.findings || []) {
    const title = String(row.title || 'Research finding');
    const principle = String(row.summary || '').trim();
    if (!principle) continue;
    events.push({
      source_type: 'research',
      source_ref: String(row.id || ''),
      title,
      principle,
      application: String(row.implementation_hint || row.jspace_relevance || ''),
      domain: String(row.research_lane || row.brain_gap_category || 'research'),
      confidence: row.priority === 'high' ? 'verified' : 'provisional',
      meta: { priority: row.priority || null, status: row.status || null },
    });
  }

  for (const row of sources.learnings || []) {
    const learning = String(row.learning || '').trim();
    if (!learning) continue;
    const isCorrection = /\[CORRECTION\]|\[PREFERENCE\]/i.test(learning);
    events.push({
      source_type: 'learning',
      source_ref: String(row.id || ''),
      title: clip(learning, 90),
      principle: learning,
      application: isCorrection
        ? 'Operator rule — prefer this over model defaults in chat, outreach, and dispatch.'
        : 'Carry forward as durable AXON operating wisdom.',
      domain: String(row.category || 'ops'),
      confidence: isCorrection ? 'verified' : 'provisional',
      meta: { source: row.source || null, project: row.project || null },
    });
  }

  for (const row of sources.signals || []) {
    const key = String(row.signal_key || row.signal_type || '').trim();
    const value = String(row.signal_value || '').trim();
    if (!key || !value) continue;
    events.push({
      source_type: 'signal',
      source_ref: String(row.id || key),
      title: `Signal: ${key}`,
      principle: `${key} → ${value}`,
      application: 'Bias tone and replies toward reinforced operator signals.',
      domain: String(row.signal_type || 'communication'),
      confidence: Number(row.evidence_count || 0) >= 3 ? 'verified' : 'provisional',
      meta: {
        evidence_count: row.evidence_count || 0,
        weight: row.weight || null,
      },
    });
  }

  return events;
}

/**
 * Pick a diverse top set so corrections don't starve ND / research wisdom.
 * @param {WisdomItem[]} ranked
 * @param {number} limit
 */
export function diversifyWisdom(ranked, limit = WISDOM_MAX_ABSORB) {
  const quotas = {
    learning: Math.max(3, Math.floor(limit * 0.4)),
    nd_corpus: Math.max(2, Math.floor(limit * 0.3)),
    research: Math.max(1, Math.floor(limit * 0.15)),
    signal: Math.max(1, Math.floor(limit * 0.1)),
  };
  const picked = [];
  const used = new Set();
  const counts = { learning: 0, nd_corpus: 0, research: 0, signal: 0, unknown: 0 };

  for (const item of ranked) {
    const t = quotas[item.source_type] != null ? item.source_type : 'unknown';
    const cap = quotas[t] ?? 1;
    if ((counts[t] || 0) >= cap) continue;
    picked.push(item);
    used.add(item.fingerprint);
    counts[t] = (counts[t] || 0) + 1;
    if (picked.length >= limit) return picked;
  }

  for (const item of ranked) {
    if (used.has(item.fingerprint)) continue;
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
}

/**
 * DIGEST — dedupe + rank watch events into wisdom items.
 * @param {Array<Record<string, unknown>>} events
 * @param {{ limit?: number }} [opts]
 * @returns {WisdomItem[]}
 */
export function digestEvents(events = [], opts = {}) {
  const limit = opts.limit ?? WISDOM_MAX_ABSORB;
  /** @type {Map<string, WisdomItem>} */
  const byFp = new Map();

  for (const ev of events) {
    const title = String(ev.title || 'Wisdom');
    const principle = clip(ev.principle, 500);
    if (!principle) continue;
    const fingerprint = wisdomFingerprint(title, principle);
    const item = {
      fingerprint,
      title: clip(title, 160),
      principle,
      application: clip(ev.application || '', 360),
      domain: String(ev.domain || 'general'),
      source_type: String(ev.source_type || 'unknown'),
      source_ref: ev.source_ref ? String(ev.source_ref) : null,
      confidence: String(ev.confidence || 'provisional'),
      salience: 0,
      meta: { ...(ev.meta || {}) },
    };
    item.salience = scoreSalience(item);

    const prev = byFp.get(fingerprint);
    if (!prev || item.salience > prev.salience) {
      byFp.set(fingerprint, item);
    } else if (prev) {
      prev.salience = Math.round((prev.salience + 0.3) * 10) / 10;
      prev.meta = { ...prev.meta, reinforced: (prev.meta?.reinforced || 0) + 1 };
    }
  }

  const ranked = Array.from(byFp.values()).sort((a, b) => b.salience - a.salience);
  return diversifyWisdom(ranked, limit);
}

/**
 * ENHANCE — project digested wisdom into J-space + prompt-ready block.
 * @param {WisdomItem[]} items
 * @param {object} [jspaceState]
 * @param {{ maxEnhance?: number }} [opts]
 */
export function enhanceFromWisdom(items = [], jspaceState = null, opts = {}) {
  const maxEnhance = opts.maxEnhance ?? WISDOM_MAX_ENHANCE;
  const top = items.slice(0, maxEnhance);
  let state = jspaceState
    ? {
        active_concepts: [...(jspaceState.active_concepts || [])],
        broadcast_queue: [...(jspaceState.broadcast_queue || [])],
        gap_backlog: jspaceState.gap_backlog || [],
        implementation_queue: jspaceState.implementation_queue || [],
        meta: { ...(jspaceState.meta || {}) },
      }
    : {
        active_concepts: [],
        broadcast_queue: [],
        gap_backlog: [],
        implementation_queue: [],
        meta: {},
      };

  for (const item of top) {
    state = postConcept(state, {
      id: `wisdom-${item.fingerprint}`,
      label: item.title.slice(0, 80),
      detail: `${item.principle}${item.application ? ` → ${item.application}` : ''}`,
      module: 'learning',
      priority: item.salience >= 6 ? 'high' : item.salience >= 4.5 ? 'medium' : 'low',
      source: `wisdom:${item.source_type}`,
      evidence_count: 1,
    });
  }

  if (top.length) {
    state = broadcastWorkspace(state);
  }

  return {
    enhanced: top,
    jspace: state,
    promptBlock: formatWisdomForPrompt(top),
    enhancedCount: top.length,
  };
}

/** Format absorbed/enhanced wisdom for LLM system prompts. */
export function formatWisdomForPrompt(items = []) {
  if (!items.length) {
    return 'Wisdom absorb (empty — run AX-WISDOM-LOOP to fill Watch→digest→enhance).';
  }
  const lines = items
    .slice(0, WISDOM_MAX_ENHANCE)
    .map(
      (w, i) =>
        `${i + 1}. [${w.domain}/${w.source_type}] ${w.title}\n   ${clip(w.principle, 160)}${
          w.application ? `\n   Apply: ${clip(w.application, 120)}` : ''
        }`,
    )
    .join('\n');
  return `Wisdom absorb (NORTHSiDE · JB) — active principles from Watch→digest→enhance:\n${lines}`;
}

/**
 * Optional Haiku polish — returns same items if no key / failure.
 * @param {WisdomItem[]} items
 * @param {string} apiKey
 * @param {typeof fetch} [fetchImpl]
 */
export async function polishWisdomWithHaiku(items, apiKey, fetchImpl = fetch) {
  if (!apiKey || !items.length) return { items, provider: 'heuristic' };

  const compact = items.slice(0, 8).map((w) => ({
    fingerprint: w.fingerprint,
    title: w.title,
    principle: w.principle,
    application: w.application,
    domain: w.domain,
  }));

  try {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 900,
        system:
          'You tighten AXON wisdom units for JB (NORTHSiDE). Return JSON only: {"items":[{"fingerprint":"...","title":"...","principle":"...","application":"..."}]} — keep fingerprints identical, plain English, no clinical claims.',
        messages: [
          {
            role: 'user',
            content: `Polish these wisdom units for operator absorb:\n${JSON.stringify(compact)}`,
          },
        ],
      }),
    });
    if (!r.ok) return { items, provider: 'heuristic' };
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { items, provider: 'heuristic' };
    const parsed = JSON.parse(match[0]);
    const byFp = new Map((parsed.items || []).map((x) => [x.fingerprint, x]));
    const polished = items.map((w) => {
      const p = byFp.get(w.fingerprint);
      if (!p) return w;
      return {
        ...w,
        title: clip(p.title || w.title, 160),
        principle: clip(p.principle || w.principle, 500),
        application: clip(p.application || w.application, 360),
      };
    });
    return { items: polished, provider: 'haiku' };
  } catch {
    return { items, provider: 'heuristic' };
  }
}

/**
 * Full loop — watch → digest → (optional polish) → enhance → absorb record.
 * @param {object} opts
 */
export async function runWisdomAbsorbLoop(opts = {}) {
  const {
    corpus = [],
    findings = [],
    learnings = [],
    signals = [],
    jspaceState = null,
    dryRun = process.env.AXON_DRY_RUN === '1',
    forceHeuristic = true,
    anthropicKey = process.env.ANTHROPIC_API_KEY || '',
    fetchImpl = fetch,
    persistItems,
    persistRun,
    persistJspace,
    operatorId = 'default',
    limit = WISDOM_MAX_ABSORB,
  } = opts;

  const watched = watchSources({ corpus, findings, learnings, signals });
  let digested = digestEvents(watched, { limit });

  let provider = 'heuristic';
  if (!forceHeuristic && anthropicKey) {
    const polished = await polishWisdomWithHaiku(digested, anthropicKey, fetchImpl);
    digested = polished.items;
    provider = polished.provider;
  }

  const enhancement = enhanceFromWisdom(digested, jspaceState);

  const dayKey = todayUtc();
  const summary = `Wisdom absorb (${provider}): watched ${watched.length}, digested ${digested.length}, enhanced ${enhancement.enhancedCount}, absorb ${dryRun ? 'dry-run' : 'live'}. Slow Takeover / Mac ON path for NORTHSiDE.`;

  const itemRows = digested.map((w) => ({
    operator_id: operatorId,
    fingerprint: w.fingerprint,
    title: w.title,
    principle: w.principle,
    application: w.application || null,
    domain: w.domain,
    source_type: w.source_type,
    source_ref: w.source_ref,
    confidence: w.confidence,
    salience: w.salience,
    status: 'absorbed',
    meta: { ...(w.meta || {}), brand: 'NORTHSiDE', loop: 'AX-WISDOM-LOOP' },
    absorbed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const runRecord = {
    operator_id: operatorId,
    day_key: dayKey,
    dry_run: dryRun,
    provider,
    watched_count: watched.length,
    digested_count: digested.length,
    enhanced_count: enhancement.enhancedCount,
    absorbed_count: dryRun ? 0 : itemRows.length,
    summary,
    meta: {
      brand: 'NORTHSiDE',
      top: digested.slice(0, 5).map((w) => ({
        title: w.title,
        salience: w.salience,
        source_type: w.source_type,
        domain: w.domain,
      })),
      prompt_preview: enhancement.promptBlock.slice(0, 400),
    },
  };

  let absorbed = [];
  let persistedRun = null;
  let persistedJspace = null;

  if (!dryRun) {
    if (typeof persistItems === 'function' && itemRows.length) {
      absorbed = await persistItems(itemRows);
    }
    if (typeof persistJspace === 'function' && enhancement.enhancedCount) {
      persistedJspace = await persistJspace(enhancement.jspace);
    }
    if (typeof persistRun === 'function') {
      persistedRun = await persistRun({
        ...runRecord,
        absorbed_count: Array.isArray(absorbed) ? absorbed.length || itemRows.length : itemRows.length,
      });
    }
  }

  return {
    ok: true,
    dryRun,
    provider,
    watchedCount: watched.length,
    digested,
    enhancement,
    itemRows,
    runRecord,
    absorbed,
    persistedRun,
    persistedJspace,
    summary,
    promptBlock: enhancement.promptBlock,
  };
}

/** Mac / cron checklist for JB. */
export function wisdomLoopChecklist({ repoPath = '~/Projects/AXON' } = {}) {
  return [
    `Update AXON at ${repoPath} and ensure .env has SUPABASE_SERVICE_KEY`,
    `Dry-run: cd ${repoPath} && npm run wisdom:dry`,
    'Confirm JSON shows watched/digested/enhanced counts without crashes',
    `Live absorb: cd ${repoPath} && npm run wisdom`,
    'Verify NI-Brain tables axon_wisdom_items + axon_wisdom_runs gain rows',
    'Optional cron (6:30 AM local, before model:daily): 30 6 * * * cd ~/Projects/AXON && npm run wisdom >>/tmp/axon-wisdom.log 2>&1',
    'Chat/J-space should surface Wisdom absorb prompt block after live run',
  ];
}
