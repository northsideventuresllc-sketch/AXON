/**
 * AXON Autonomous Research — studies AI models, OSS repos, neuroscience.
 * Runs 4x/week via GitHub Actions; findings surface in daily briefs.
 */

import { HAIKU_MODEL } from './constants.mjs';
import {
  BRAIN_GAP_CATALOG,
  broadcastWorkspace,
  enqueueImplementation,
  formatJspaceForPrompt,
  getJspaceState,
  postConcept,
  saveJspaceState,
} from './axon-j-space-core.mjs';

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

async function callHaiku(apiKey, system, user, maxTokens = 2000) {
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

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
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

async function synthesizeFindings(apiKey, lane, sources, jspaceContext) {
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

  const text = await callHaiku(apiKey, system, user, 2500);
  return extractJson(text);
}

export async function fetchRecentFindings(sbSelect, operatorId = 'default', limit = 10) {
  const rows = await sbSelect(
    'axon_research_findings',
    `operator_id=eq.${encodeURIComponent(operatorId)}&order=created_at.desc&limit=${limit}&select=*`
  );
  return rows || [];
}

export async function countRunsThisWeek(sbSelect, operatorId = 'default') {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await sbSelect(
    'axon_research_runs',
    `operator_id=eq.${encodeURIComponent(operatorId)}&created_at=gte.${weekAgo}&select=id`
  );
  return rows?.length || 0;
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
 * @returns {{ findings, briefingUpdates, lane, runId }}
 */
export async function runAutonomousResearch({
  sbSelect,
  sbInsert,
  sbPatch,
  anthropicKey,
  serpApiKey,
  operatorId = 'default',
  lane,
  dryRun = false,
  applyBriefingFn,
}) {
  const selectedLane = lane || pickResearchLane();
  console.log(`AXON research — lane: ${selectedLane}`);

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

  const synthesis = await synthesizeFindings(anthropicKey, selectedLane, sources, jspaceContext);
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

  let runRow = null;
  if (!dryRun) {
    runRow = await sbInsert('axon_research_runs', {
      operator_id: operatorId,
      lane: selectedLane,
      findings_count: findings.length,
      briefing_items_added: briefingUpdates.length,
      status: 'completed',
      meta: { source_count: sources.length },
    });
  }

  return {
    lane: selectedLane,
    findings: dryRun ? findings : savedFindings,
    briefingUpdates,
    runId: runRow?.id,
    sourcesUsed: sources.length,
  };
}
