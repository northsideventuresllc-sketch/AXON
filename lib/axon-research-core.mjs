/**
 * AXON Autonomous Research — studies AI models, OSS repos, neuroscience.
 * Runs 4x/week via GitHub Actions; findings surface in daily briefs.
 * Every live research job writes an `axon_research_runs` lab-log row (AX-RESEARCH-RUNS).
 * LLM cascade: Haiku → Gemini → heuristic gather (AX-SELF-RESEARCH-FIX).
 */

import { GEMINI_MODEL, HAIKU_MODEL, resolveGeminiModels } from './constants.mjs';
import {
  BRAIN_GAP_CATALOG,
  broadcastWorkspace,
  enqueueImplementation,
  formatJspaceForPrompt,
  getJspaceState,
  postConcept,
  saveJspaceState,
} from './axon-j-space-core.mjs';

export const RESEARCH_RUN_TABLE = 'axon_research_runs';

export const RESEARCH_LANES = [
  {
    id: 'ai_models',
    label: 'AI model architectures',
    queries: [
      'LLM agent memory architecture 2026',
      'AI global workspace reasoning',
      'autonomous AI self-improvement systems',
      'Claude J-space Jacobian lens interpretability',
    ],
  },
  {
    id: 'open_source',
    label: 'Open source AI repos',
    queries: [
      'github autonomous agent framework stars:>500',
      'github AI memory layer open source',
      'github agent orchestration self-learning',
    ],
  },
  {
    id: 'neuroscience',
    label: 'Human brain & cognition',
    queries: [
      'global workspace theory consciousness neuroscience',
      'human brain capabilities AI cannot replicate',
      'episodic memory consolidation sleep neuroscience',
    ],
  },
];

const LANE_ROTATION = ['ai_models', 'open_source', 'neuroscience'];
const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_BASE_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Force flag for weekly-cap bypass — only true/1/yes count (not the string "false"). */
export function isResearchForceEnabled(env = process.env) {
  const v = String(env.AXON_RESEARCH_FORCE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Hard billing / quota — do not retry same provider. */
export function isHardQuotaError(err) {
  const msg = String(err?.message || err).toLowerCase();
  return (
    msg.includes('credit balance is too low')
    || msg.includes('exceeded your current quota')
    || msg.includes('billing details')
    || msg.includes('quota_exceeded')
    || msg.includes('resource_exhausted')
    || msg.includes('insufficient_quota')
    || msg.includes('payment method')
  );
}

/** Transient network / rate limits — safe to retry. */
export function isTransientResearchError(err) {
  if (isHardQuotaError(err)) return false;
  const msg = String(err?.message || err).toLowerCase();
  return (
    msg.includes('429')
    || msg.includes('rate')
    || msg.includes('529')
    || msg.includes('503')
    || msg.includes('502')
    || msg.includes('timeout')
    || msg.includes('econnreset')
    || msg.includes('fetch failed')
  );
}

async function callHaiku(apiKey, system, user, maxTokens = 2000) {
  if (!apiKey) throw new Error('Anthropic API key missing');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.map((c) => c.text || '').join('').trim();
}

async function callGeminiOnce(apiKey, prompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 2500,
        temperature: 0.2,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Gemini HTTP ${r.status}${body ? `: ${body.slice(0, 240)}` : ''}`);
  }
  const data = await r.json();
  const finish = data.candidates?.[0]?.finishReason;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim();
  if (!text) throw new Error(`Gemini empty response${finish ? ` (${finish})` : ''}`);
  return text;
}

/**
 * Gemini cascade: models × keys, fail-fast on hard quota, retry transient 429s.
 * @returns {{ text: string, model: string }}
 */
async function callGemini(apiKey, backupKey, prompt, models) {
  const keys = [apiKey, backupKey].filter(Boolean);
  if (!keys.length) throw new Error('Gemini API key missing');
  const modelList = models?.length ? models : resolveGeminiModels(GEMINI_MODEL);

  let lastErr;
  for (const model of modelList) {
    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const key = keys[keyIdx];
      for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            const waitMs = GEMINI_RETRY_BASE_MS * 2 ** (attempt - 1);
            console.log(`Gemini ${model} retry ${attempt}/${GEMINI_MAX_RETRIES - 1} in ${waitMs}ms`);
            await sleep(waitMs);
          }
          const text = await callGeminiOnce(key, prompt, model);
          return { text, model };
        } catch (err) {
          lastErr = err;
          if (isHardQuotaError(err)) {
            console.warn(
              `Gemini ${model} hard quota on key ${keyIdx + 1}/${keys.length} — skipping retries`
            );
            break;
          }
          if (!isTransientResearchError(err) || attempt >= GEMINI_MAX_RETRIES - 1) break;
        }
      }
    }
  }
  throw lastErr || new Error('Gemini failed');
}

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

/**
 * Last-resort synthesis from gathered sources when LLM providers are unavailable.
 * Keeps MWFSa research green without inventing false intelligence.
 */
export function heuristicSynthesis(lane, sources = []) {
  const laneLabel = RESEARCH_LANES.find((l) => l.id === lane)?.label || lane;
  const list = (sources || []).filter((s) => s?.title || s?.link).slice(0, 4);
  const findings = (list.length ? list : [
    {
      title: 'Anthropic J-Space / global workspace (reference)',
      link: 'https://www.anthropic.com/research/global-workspace',
      snippet: 'Verbalizable J-space as workspace analogue — NORTHSiDE AXON tracks brain gaps offline.',
    },
  ]).map((s, i) => ({
    title: String(s.title || `Research source ${i + 1}`).slice(0, 140),
    summary:
      String(s.snippet || '').trim().slice(0, 400)
      || 'Source captured during AXON self-research; LLM synthesis unavailable (billing/quota).',
    source_urls: s.link ? [s.link] : [],
    implementation_hint:
      'JB: review source; queue NORTHSiDE backend follow-up if it closes a J-space / memory gap.',
    priority: i === 0 ? 'medium' : 'low',
    jspace_relevance: 'Gather-only row — LLM cascade exhausted; concept pending operator review.',
    brain_gap_category: 'learning',
  }));

  return {
    findings,
    jspace_concepts: findings.slice(0, 1).map((f) => ({
      label: f.title.slice(0, 72),
      detail: f.summary.slice(0, 220),
      priority: 'medium',
      module: 'research',
    })),
    briefing_headline: `${laneLabel}: ${findings.length} source(s) captured (heuristic)`,
    briefing_detail:
      'Haiku/Gemini unavailable for synthesis. NORTHSiDE AXON stored gather results for JB review.',
    _provider: 'heuristic',
  };
}

/** Pick research lane based on day-of-week rotation */
export function pickResearchLane(date = new Date()) {
  const day = date.getUTCDay();
  const idx = Math.floor(day / 2) % LANE_ROTATION.length;
  return LANE_ROTATION[idx];
}

async function searchWeb(serpApiKey, query) {
  if (!serpApiKey) return [];
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '5');
  url.searchParams.set('api_key', serpApiKey);

  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.organic_results || []).slice(0, 5).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || '',
    }));
  } catch {
    return [];
  }
}

async function searchGitHub(query, token) {
  const q = query.replace(/^github\s+/i, '');
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', q);
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('per_page', '5');

  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const r = await fetch(url, { headers });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.items || []).slice(0, 5).map((repo) => ({
      title: repo.full_name,
      link: repo.html_url,
      snippet: `${repo.description || ''} ★${repo.stargazers_count}`.trim(),
      stars: repo.stargazers_count,
    }));
  } catch {
    return [];
  }
}

async function gatherSources(lane, cfg) {
  const laneConfig = RESEARCH_LANES.find((l) => l.id === lane) || RESEARCH_LANES[0];
  const githubToken =
    process.env.AXON_GITHUB_PAT || process.env.GITHUB_PAT || process.env.NI_GITHUB_PAT;

  const sources = [];
  for (const query of laneConfig.queries.slice(0, 2)) {
    if (lane === 'open_source' || query.toLowerCase().includes('github')) {
      sources.push(...(await searchGitHub(query, githubToken)));
    } else {
      sources.push(...(await searchWeb(cfg.serpApiKey, query)));
    }
  }

  const seen = new Set();
  return sources.filter((s) => {
    if (!s.link || seen.has(s.link)) return false;
    seen.add(s.link);
    return true;
  }).slice(0, 8);
}

function buildSynthesisPrompt(lane, sources, jspaceContext) {
  const laneLabel = RESEARCH_LANES.find((l) => l.id === lane)?.label || lane;
  const gapSummary = BRAIN_GAP_CATALOG.map((g) => `- ${g.id}: ${g.gap}`).join('\n');

  const system = `You are AXON's autonomous research engine for NORTHSiDE Intelligence.
Analyze sources and produce actionable intelligence for backend self-improvement.
Focus on what competitors/other AI systems do that AXON lacks, and neuroscience gaps to mitigate.
Return JSON only.`;

  const user = `Research lane: ${laneLabel}
Date: ${new Date().toISOString().slice(0, 10)}

Sources:
${sources.map((s, i) => `${i + 1}. ${s.title}\n   ${s.link}\n   ${s.snippet}`).join('\n\n')}

Known brain gaps AI has not replicated:
${gapSummary}

Current J-space:
${jspaceContext}

Return JSON:
{
  "findings": [
    {
      "title": "short headline",
      "summary": "2-3 sentences — what was discovered",
      "source_urls": ["url"],
      "implementation_hint": "specific backend change AXON could make",
      "priority": "high|medium|low",
      "jspace_relevance": "how this relates to global workspace / J-space",
      "brain_gap_category": "architecture|memory|selfhood|representation|attention|agency|learning"
    }
  ],
  "jspace_concepts": [
    { "label": "verbalizable concept", "detail": "why it matters now", "priority": "high|medium|low", "module": "research|execution|learning" }
  ],
  "briefing_headline": "one-line for operator daily brief",
  "briefing_detail": "2-3 sentences for operator"
}

Produce 2-4 findings. At least one must reference a concrete OSS repo or paper if sources allow.`;

  return { system, user, combined: `${system}\n\n${user}` };
}

/**
 * Haiku → Gemini → heuristic. Hard Anthropic/Gemini quota fails over immediately.
 * @returns {Promise<object>} synthesis JSON including `_provider`
 */
export async function synthesizeFindings({
  anthropicKey,
  geminiKey,
  geminiBackup,
  geminiModel,
  lane,
  sources,
  jspaceContext,
} = {}) {
  const { system, user, combined } = buildSynthesisPrompt(lane, sources, jspaceContext);
  const errors = [];

  if (anthropicKey) {
    try {
      const text = await callHaiku(anthropicKey, system, user, 2500);
      const parsed = extractJson(text);
      return { ...parsed, _provider: 'haiku', _model: HAIKU_MODEL };
    } catch (err) {
      errors.push(`haiku: ${err.message}`);
      if (isHardQuotaError(err)) {
        console.warn('Anthropic hard quota/billing — cascading to Gemini');
      } else {
        console.warn(`Haiku synthesis failed (${err.message}) — trying Gemini`);
      }
    }
  } else {
    console.warn('ANTHROPIC_API_KEY missing — trying Gemini for research synthesis');
  }

  if (geminiKey || geminiBackup) {
    try {
      const models = resolveGeminiModels(geminiModel || GEMINI_MODEL);
      const { text, model } = await callGemini(geminiKey, geminiBackup, combined, models);
      const parsed = extractJson(text);
      return { ...parsed, _provider: 'gemini', _model: model };
    } catch (err) {
      errors.push(`gemini: ${err.message}`);
      console.warn(`Gemini synthesis failed (${err.message}) — using heuristic gather`);
    }
  } else {
    console.warn('GEMINI_API_KEY missing — using heuristic gather for research synthesis');
  }

  const fallback = heuristicSynthesis(lane, sources);
  fallback._cascade_errors = errors.slice(0, 4);
  return fallback;
}

export async function fetchRecentFindings(sbSelect, operatorId = 'default', limit = 10) {
  const rows = await sbSelect(
    'axon_research_findings',
    `operator_id=eq.${encodeURIComponent(operatorId)}&order=created_at.desc&limit=${limit}&select=*`
  );
  return rows || [];
}

/** Recent research lab-log rows (audit + rate-limit source of truth). */
export async function fetchRecentResearchRuns(sbSelect, operatorId = 'default', limit = 12) {
  const rows = await sbSelect(
    RESEARCH_RUN_TABLE,
    `operator_id=eq.${encodeURIComponent(operatorId)}&order=created_at.desc&limit=${limit}&select=*`
  );
  return rows || [];
}

export async function countRunsThisWeek(sbSelect, operatorId = 'default') {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await sbSelect(
    RESEARCH_RUN_TABLE,
    `operator_id=eq.${encodeURIComponent(operatorId)}&status=eq.completed&created_at=gte.${weekAgo}&select=id`
  );
  return rows?.length || 0;
}

/**
 * Build a lab-log payload for axon_research_runs.
 * Statuses: completed | failed | skipped
 */
export function buildResearchRunLabLog({
  operatorId = 'default',
  lane,
  findingsCount = 0,
  briefingItemsAdded = 0,
  status = 'completed',
  errorMessage = null,
  meta = {},
  summary = null,
  createdAt = null,
} = {}) {
  const laneLabel = lane || 'unknown';
  const resolvedSummary =
    summary ||
    (status === 'completed'
      ? `AXON research lab (${laneLabel}): ${findingsCount} finding(s), ${briefingItemsAdded} briefing item(s).`
      : status === 'skipped'
        ? `AXON research lab skipped (${laneLabel}): ${errorMessage || 'weekly cap reached'}`
        : `AXON research lab ${status} (${laneLabel}): ${errorMessage || 'unknown error'}`);

  const row = {
    operator_id: operatorId,
    lane: laneLabel,
    findings_count: findingsCount,
    briefing_items_added: briefingItemsAdded,
    status,
    error_message: errorMessage,
    summary: resolvedSummary,
    meta: {
      brand: 'NORTHSiDE',
      operator: 'JB',
      job_code: 'AX-RESEARCH-RUNS',
      logged_at: new Date().toISOString(),
      ...meta,
    },
  };
  if (createdAt) row.created_at = createdAt;
  return row;
}

/** Persist one research lab-log row to NI-Brain. */
export async function writeResearchRunLabLog(sbInsert, payload) {
  const row = buildResearchRunLabLog(payload);
  return sbInsert(RESEARCH_RUN_TABLE, row);
}

/** Apply briefing updates directly via NI-Brain (script-safe, no TS import). */
export async function applyBriefingUpdatesRaw(sbSelect, sbInsert, sbPatch, updates, operatorId = 'default') {
  if (!updates?.length) return;

  const profiles = await sbSelect(
    'axon_operator_profiles',
    `operator_id=eq.${encodeURIComponent(operatorId)}&select=context_data&limit=1`
  );
  const contextData = profiles?.[0]?.context_data || {};
  const raw = contextData.workspace || {};
  const now = new Date().toISOString();
  let briefing = Array.isArray(raw.briefing) ? [...raw.briefing] : [];

  for (const u of updates) {
    if (u.action === 'add' && u.title) {
      briefing.unshift({
        id: `brief-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: u.title,
        content: u.content || '',
        priority: u.priority || 'medium',
        source: u.source || 'axon',
        created_at: now,
        updated_at: now,
      });
    } else if (u.action === 'remove' && u.id) {
      briefing = briefing.filter((b) => b.id !== u.id);
    }
  }

  briefing = briefing.slice(0, 12);

  await sbPatch('axon_operator_profiles', `operator_id=eq.${encodeURIComponent(operatorId)}`, {
    context_data: {
      ...contextData,
      workspace: {
        ...raw,
        briefing,
        last_briefing_refresh: now,
      },
    },
    updated_at: now,
  });
}

/**
 * Run one autonomous research cycle.
 * Always writes an axon_research_runs lab-log row on live runs (success or failure).
 * @returns {{ findings, briefingUpdates, lane, runId, summary }}
 */
export async function runAutonomousResearch({
  sbSelect,
  sbInsert,
  sbPatch,
  anthropicKey,
  geminiKey,
  geminiBackup,
  geminiModel,
  serpApiKey,
  operatorId = 'default',
  lane,
  dryRun = false,
  applyBriefingFn,
}) {
  const selectedLane = lane || pickResearchLane();
  console.log(`AXON research — lane: ${selectedLane}`);

  try {
    let jspace = await getJspaceState(sbSelect, operatorId);
    const jspaceContext = formatJspaceForPrompt(jspace);

    const sources = await gatherSources(selectedLane, { serpApiKey });
    console.log(`Gathered ${sources.length} source(s)`);

    if (!sources.length) {
      console.warn('No sources found — using brain-gap catalog for synthesis');
      sources.push({
        title: 'Anthropic J-Space Research (Jul 2026)',
        link: 'https://www.anthropic.com/research/global-workspace',
        snippet: 'J-space emerged spontaneously in Claude as a global workspace for verbalizable reasoning.',
      });
    }

    const synthesis = await synthesizeFindings({
      anthropicKey,
      geminiKey,
      geminiBackup,
      geminiModel,
      lane: selectedLane,
      sources,
      jspaceContext,
    });
    const provider = synthesis._provider || 'unknown';
    console.log(`Synthesis provider: ${provider}${synthesis._model ? ` (${synthesis._model})` : ''}`);
    const findings = synthesis.findings || [];
    const savedFindings = [];

    if (!dryRun) {
      for (const f of findings) {
        const row = await sbInsert('axon_research_findings', {
          operator_id: operatorId,
          research_lane: selectedLane,
          title: f.title,
          summary: f.summary,
          source_urls: f.source_urls || [],
          implementation_hint: f.implementation_hint || null,
          priority: f.priority || 'medium',
          status: 'new',
          jspace_relevance: f.jspace_relevance || null,
          brain_gap_category: f.brain_gap_category || null,
          meta: { synthesized_at: new Date().toISOString() },
        });
        savedFindings.push(row);
        jspace = enqueueImplementation(jspace, { ...f, id: row.id, research_lane: selectedLane });
      }

      for (const concept of synthesis.jspace_concepts || []) {
        jspace = postConcept(jspace, concept);
      }

      jspace = broadcastWorkspace(jspace);
      jspace.meta = {
        ...jspace.meta,
        research_cycles: (jspace.meta.research_cycles || 0) + 1,
        last_research_lane: selectedLane,
        last_research_at: new Date().toISOString(),
      };

      await saveJspaceState(sbInsert, sbPatch, jspace, operatorId);
    } else {
      console.log('[DRY RUN] Would save findings:', JSON.stringify(findings, null, 2));
    }

    const briefingUpdates = [];
    if (synthesis.briefing_headline && !dryRun) {
      briefingUpdates.push({
        action: 'add',
        title: `🔬 Research: ${synthesis.briefing_headline}`,
        content: [
          synthesis.briefing_detail || '',
          '',
          `Lane: ${selectedLane}`,
          `Findings: ${findings.length}`,
          findings
            .slice(0, 2)
            .map((f) => `• ${f.title} — ${(f.implementation_hint || '').slice(0, 120)}`)
            .join('\n'),
        ]
          .filter(Boolean)
          .join('\n'),
        priority: findings.some((f) => f.priority === 'high') ? 'high' : 'medium',
        source: 'axon',
      });

      for (const f of findings.filter((x) => x.priority === 'high').slice(0, 1)) {
        briefingUpdates.push({
          action: 'add',
          title: `⚡ Implement: ${f.title}`,
          content: `${f.summary}\n\nNext step: ${f.implementation_hint || 'Review in AXON research queue'}`,
          priority: 'high',
          source: 'axon',
        });
      }

      if (applyBriefingFn) {
        await applyBriefingFn(briefingUpdates);
      } else {
        await applyBriefingUpdatesRaw(sbSelect, sbInsert, sbPatch, briefingUpdates, operatorId);
      }
    }

    const summary = `AXON research lab (${selectedLane}): ${findings.length} finding(s), ${briefingUpdates.length} briefing item(s), ${sources.length} source(s) via ${provider}.`;
    let runRow = null;
    if (!dryRun) {
      runRow = await writeResearchRunLabLog(sbInsert, {
        operatorId,
        lane: selectedLane,
        findingsCount: findings.length,
        briefingItemsAdded: briefingUpdates.length,
        status: 'completed',
        summary,
        meta: {
          source_count: sources.length,
          briefing_headline: synthesis.briefing_headline || null,
          jspace_concepts: (synthesis.jspace_concepts || []).length,
          synthesis_provider: provider,
          synthesis_model: synthesis._model || null,
          cascade_errors: synthesis._cascade_errors || null,
          job_fix: 'AX-SELF-RESEARCH-FIX',
        },
      });
    } else {
      console.log(`[DRY RUN] Would write ${RESEARCH_RUN_TABLE}: ${summary}`);
    }

    return {
      lane: selectedLane,
      findings: dryRun ? findings : savedFindings,
      briefingUpdates,
      runId: runRow?.id,
      sourcesUsed: sources.length,
      provider,
      summary,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!dryRun && typeof sbInsert === 'function') {
      try {
        await writeResearchRunLabLog(sbInsert, {
          operatorId,
          lane: selectedLane,
          findingsCount: 0,
          briefingItemsAdded: 0,
          status: 'failed',
          errorMessage: message.slice(0, 500),
          meta: { failed_at: new Date().toISOString() },
        });
      } catch (logErr) {
        console.error('Failed to write research lab log:', logErr);
      }
    }
    throw err;
  }
}
