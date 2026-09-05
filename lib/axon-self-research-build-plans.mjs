/**
 * AXON Self-Research — three-area build-plan mode.
 * JB direct order 2026-08-26 (AXON-3-JOBS-REBUILD): every run covers THREE areas,
 * each turned into a concrete implementation plan (not just a "finding"):
 *   (a) neuroscience  -> LLM/code-term equivalent -> what kind of build it implies
 *   (b) psychology    -> how it could help AXON understand users more deeply
 *   (c) AI news       -> what's being built elsewhere -> how to build it into AXON
 * Output hands off to the AXON Executive via agent_bus (needs_answer=true).
 *
 * Cascade order (locked org-wide, Decision #598/#619): AXON-local (mini) ->
 * RunPod AXON v1 -> Gemini (main, backup) -> Haiku (paid last resort) -> heuristic.
 * Reuses axon-research-core's error classifiers + j-space + lab-log so this stays
 * wired into the existing dashboard/brain-gap system instead of forking it.
 */
import { GEMINI_MODEL, HAIKU_MODEL, resolveGeminiModels } from './constants.mjs';
import { callAxonLocal } from './axon-local-relay.mjs';
import { callAxonV1Cloud } from './axon-v1-cloud-relay.mjs';
import { isHardQuotaError, isTransientResearchError, writeResearchRunLabLog } from './axon-research-core.mjs';
import {
  broadcastWorkspace,
  enqueueImplementation,
  formatJspaceForPrompt,
  getJspaceState,
  postConcept,
  saveJspaceState,
} from './axon-j-space-core.mjs';
import { handoffToAgent, telegramAlert } from './axon-agent-comms.mjs';

export const THREE_AREAS = [
  {
    id: 'neuroscience_build',
    label: 'Neuroscience → build plan',
    query: 'neuroscience discovery 2026 memory attention cognition brain mechanism',
    instruction:
      'Find one real, recent neuroscience finding (memory consolidation, attention, prediction, ' +
      'emotion regulation — any mechanism). Translate it into the closest LLM/code-architecture ' +
      'equivalent (e.g. "sleep replay" -> "offline batch retraining pass", "attention gating" -> ' +
      '"context-window relevance scoring"), then say exactly what kind of build that implies for AXON.',
  },
  {
    id: 'psychology_ux',
    label: 'Psychology → user understanding',
    query: 'psychology research 2026 behavior motivation decision-making habit formation',
    instruction:
      'Find one real, recent psychology finding about how people think, decide, or form habits. ' +
      'Say concretely how AXON could use it to understand JB (or any future AXON user) more deeply ' +
      '— what signal to track, what question to ask, what UX/behavior AXON should change.',
  },
  {
    id: 'ai_news_build',
    label: 'AI news → what to build',
    query: 'AI agent product launch 2026 new capability autonomous',
    instruction:
      'Find one real, recent thing another AI product/lab shipped (a capability, a UX pattern, an ' +
      'architecture). Say what it is, then a concrete plan for building an equivalent (or better) ' +
      'version into AXON — not "we should look into this," an actual buildable step.',
  },
];

const HAIKU_SYSTEM =
  'You are AXON self-research for Northside (NVG). Every finding becomes a concrete, buildable plan ' +
  '— never "worth exploring." Return JSON only, no prose outside the JSON.';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

function buildAreaPrompt(area, sources, jspaceContext) {
  const sourceBlock = sources.length
    ? sources.map((s, i) => `${i + 1}. ${s.title}\n   ${s.link}\n   ${s.snippet}`).join('\n\n')
    : '(no live web sources reachable this run — reason from established, well-known research/product patterns instead of inventing a fake citation)';

  return `Area: ${area.label}
${area.instruction}

Sources:
${sourceBlock}

Current AXON J-space (what AXON already knows about itself):
${jspaceContext}

Return JSON:
{
  "finding": "one or two sentences — the real thing you found",
  "equivalent_or_signal": "the LLM/code-architecture equivalent (area a), the user-signal to track (area b), or the AI capability (area c)",
  "build_plan": {
    "what_to_build": "concrete, specific — a component, a query, a table, a prompt change",
    "steps": ["step 1", "step 2", "step 3"],
    "effort": "small|medium|large",
    "priority": "high|medium|low"
  },
  "plain_english": "1-2 sentences, zero jargon, ADHD-friendly — what this means and why it matters, written for a human skim-reading a phone alert",
  "source_urls": ["url"]
}`;
}

/** AXON-local -> RunPod v1 -> Gemini -> Haiku -> heuristic. Never throws. */
async function synthesizeArea({ area, sources, jspaceContext, supabaseKey, geminiKey, geminiBackup, geminiModel, anthropicKey }) {
  const prompt = buildAreaPrompt(area, sources, jspaceContext);
  const errors = [];

  if (supabaseKey) {
    try {
      const text = await callAxonLocal(supabaseKey, HAIKU_SYSTEM, prompt);
      if (text) return { ...extractJson(text), _provider: 'axon-local' };
    } catch (err) {
      errors.push(`axon-local: ${err.message}`);
    }
    try {
      const text = await callAxonV1Cloud(supabaseKey, HAIKU_SYSTEM, prompt);
      if (text) return { ...extractJson(text), _provider: 'axon-v1-runpod' };
    } catch (err) {
      errors.push(`axon-v1-runpod: ${err.message}`);
    }
  }

  if (geminiKey || geminiBackup) {
    const models = resolveGeminiModels(geminiModel || GEMINI_MODEL);
    const keys = [geminiKey, geminiBackup].filter(Boolean);
    outer: for (const model of models) {
      for (const key of keys) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1));
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const r = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${HAIKU_SYSTEM}\n\n${prompt}` }] }],
                generationConfig: { maxOutputTokens: 900, temperature: 0.3, responseMimeType: 'application/json' },
              }),
            });
            if (!r.ok) {
              const body = await r.text();
              const err = new Error(`Gemini HTTP ${r.status}: ${body.slice(0, 200)}`);
              errors.push(`gemini ${model}: ${err.message}`);
              if (isHardQuotaError(err)) continue outer;
              if (!isTransientResearchError(err)) break;
              continue;
            }
            const data = await r.json();
            const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim();
            if (text) return { ...extractJson(text), _provider: 'gemini', _model: model };
          } catch (err) {
            errors.push(`gemini ${model}: ${err.message}`);
          }
        }
      }
    }
  }

  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: HAIKU_MODEL,
          max_tokens: 900,
          system: HAIKU_SYSTEM,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.content?.map((c) => c.text || '').join('').trim();
        if (text) return { ...extractJson(text), _provider: 'haiku' };
      } else {
        errors.push(`haiku: HTTP ${r.status}`);
      }
    } catch (err) {
      errors.push(`haiku: ${err.message}`);
    }
  }

  // Heuristic — always produces a usable, honest row (never invents a fake source).
  const top = sources[0];
  return {
    finding: top
      ? `Captured but not synthesized (no AI cascade reachable this run): ${top.title}`
      : `No live sources and no AI cascade reachable for "${area.label}" this run — gather-only.`,
    equivalent_or_signal: 'Pending — needs a real synthesis pass once a provider is reachable.',
    build_plan: {
      what_to_build: 'N/A — retry this area next run.',
      steps: ['Re-run once AXON-local/Gemini/Haiku is reachable'],
      effort: 'small',
      priority: 'low',
    },
    plain_english: `Couldn't fully think this one through today — ${area.label.toLowerCase()} — will try again next run.`,
    source_urls: top?.link ? [top.link] : [],
    _provider: 'heuristic',
    _cascade_errors: errors.slice(0, 3),
  };
}

/**
 * Run the three-area research + build-plan cycle, save findings/J-space,
 * write a research_runs lab-log row, and return everything needed for the
 * caller to hand off to the AXON Executive and post a Telegram alert
 * if something's genuinely urgent (all 3 areas fell to heuristic).
 */
export async function runThreeAreaResearch({
  sbSelect,
  sbInsert,
  sbPatch,
  supabaseKey,
  anthropicKey,
  geminiKey,
  geminiBackup,
  geminiModel,
  serpApiKey,
  operatorId = 'default',
  dryRun = false,
  budgetCheck = () => false, // returns true when time budget is exhausted
}) {
  let jspace = await getJspaceState(sbSelect, operatorId);
  const jspaceContext = formatJspaceForPrompt(jspace);

  const results = [];
  let stoppedEarly = null;

  for (const area of THREE_AREAS) {
    if (budgetCheck()) {
      stoppedEarly = area.id;
      console.log(`⏳ Time budget hit before "${area.label}" — will resume next scheduled run.`);
      break;
    }

    console.log(`Researching: ${area.label}`);
    const sources = await searchWeb(serpApiKey, area.query);
    const result = await synthesizeArea({
      area,
      sources,
      jspaceContext,
      supabaseKey,
      geminiKey,
      geminiBackup,
      geminiModel,
      anthropicKey,
    });
    console.log(`  -> provider=${result._provider || 'unknown'} priority=${result.build_plan?.priority || '?'}`);
    results.push({ area, sources, result });

    if (!dryRun) {
      const row = await sbInsert('axon_research_findings', {
        operator_id: operatorId,
        research_lane: area.id,
        title: `${area.label}: ${String(result.finding || '').slice(0, 100)}`,
        summary: result.finding || '',
        source_urls: result.source_urls || [],
        implementation_hint: result.build_plan?.what_to_build || null,
        priority: result.build_plan?.priority || 'medium',
        status: 'new',
        jspace_relevance: result.equivalent_or_signal || null,
        brain_gap_category: area.id === 'neuroscience_build' ? 'architecture' : area.id === 'psychology_ux' ? 'selfhood' : 'learning',
        meta: {
          synthesized_at: new Date().toISOString(),
          area: area.id,
          build_plan: result.build_plan || null,
          plain_english: result.plain_english || null,
          provider: result._provider || null,
        },
      }).catch((err) => {
        console.log(`⚠️ axon_research_findings insert failed for ${area.id}: ${err.message}`);
        return null;
      });
      jspace = enqueueImplementation(jspace, {
        title: `${area.label}: ${result.build_plan?.what_to_build || result.finding}`,
        summary: result.finding,
        implementation_hint: result.build_plan?.what_to_build,
        priority: result.build_plan?.priority || 'medium',
        id: row?.id,
        research_lane: area.id,
      });
      jspace = postConcept(jspace, {
        label: `${area.label}`.slice(0, 72),
        detail: (result.equivalent_or_signal || result.finding || '').slice(0, 220),
        priority: result.build_plan?.priority || 'medium',
        module: 'research',
      });
    }
  }

  if (!dryRun) {
    jspace = broadcastWorkspace(jspace);
    jspace.meta = {
      ...jspace.meta,
      research_cycles: (jspace.meta.research_cycles || 0) + 1,
      last_research_lane: 'three_area_build_plans',
      last_research_at: new Date().toISOString(),
    };
    await saveJspaceState(sbInsert, sbPatch, jspace, operatorId).catch((err) =>
      console.log(`⚠️ J-space save failed: ${err.message}`)
    );
  }

  const allHeuristic = results.length > 0 && results.every((r) => r.result._provider === 'heuristic');
  const summary = `AXON self-research (3-area build plans): ${results.length}/${THREE_AREAS.length} area(s) done` +
    (stoppedEarly ? `, stopped at "${stoppedEarly}" (time budget)` : '') +
    ` — providers: ${results.map((r) => r.result._provider || '?').join(', ') || 'none'}.`;

  let runRow = null;
  if (!dryRun) {
    runRow = await writeResearchRunLabLog(sbInsert, {
      operatorId,
      lane: 'three_area_build_plans',
      findingsCount: results.length,
      briefingItemsAdded: 0,
      status: stoppedEarly ? 'completed' : 'completed',
      summary,
      meta: {
        stopped_early_at: stoppedEarly,
        areas_done: results.map((r) => r.area.id),
        job_fix: 'AXON-3-JOBS-REBUILD-0826',
      },
    }).catch((err) => {
      console.log(`⚠️ lab-log write failed: ${err.message}`);
      return null;
    });
  }

  return { results, stoppedEarly, allHeuristic, summary, runId: runRow?.id, jspace };
}

/** Build the agent_bus body handed to the AXON Executive. */
export function buildHandoffBody(results, stoppedEarly) {
  return {
    kind: 'self_research_build_plans',
    date: new Date().toISOString().slice(0, 10),
    stopped_early_at: stoppedEarly,
    plain_english_summary: results
      .map((r) => `${r.area.label}: ${r.result.plain_english || r.result.finding}`)
      .join(' | '),
    plans: results.map((r) => ({
      area: r.area.id,
      label: r.area.label,
      finding: r.result.finding,
      equivalent_or_signal: r.result.equivalent_or_signal,
      build_plan: r.result.build_plan,
      plain_english: r.result.plain_english,
      source_urls: r.result.source_urls || [],
      provider: r.result._provider,
    })),
  };
}

export { handoffToAgent, telegramAlert };
