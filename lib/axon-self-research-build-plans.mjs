/**
 * AXON Self-Research — three-area build-plan mode, plus the Mon/Wed/Fri competitor lane.
 * JB direct order 2026-08-26 (AXON-3-JOBS-REBUILD): every run covers THREE areas,
 * each turned into a concrete implementation plan (not just a "finding"):
 *   (a) neuroscience  -> LLM/code-term equivalent -> what kind of build it implies
 *   (b) psychology    -> how it could help AXON understand users more deeply
 *   (c) AI news       -> what's being built elsewhere -> how to build it into AXON
 * Output hands off to the AXON Executive via agent_bus (needs_answer=true).
 *
 * Build Plan A ticket A2 (2026-09-06, Decision #1786 "scripts out, agents in") folds
 * nv-vault's retired standalone axon-competitor-scan.mjs in as a FOURTH area:
 *   (d) competitor -> one venture's competitor/adjacent-product move -> gap + build plan
 * gated to run only Mon/Wed/Fri (isCompetitorLaneDay), the old script's own cadence —
 * a lane-level day check, not a new cron entry. See buildCompetitorArea below.
 *
 * Generation goes through the one locked router chain (lib/axon-router-core.mjs:
 * local -> RunPod -> OpenRouter free -> Gemini -> Anthropic last), then heuristic.
 * Reuses axon-research-core's error classifiers + j-space + lab-log so this stays
 * wired into the existing dashboard/brain-gap system instead of forking it.
 */
import { webSearchRows } from './web-search.mjs';
import { generateViaRouter } from './axon-generate.mjs';
import { writeResearchRunLabLog } from './axon-research-core.mjs';
import { loadVentureList } from './axon-content-scaffold-shared.mjs';
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

/**
 * Competitors lane (BPA ticket A2, folds nv-vault's retired axon-competitor-scan.mjs,
 * Decision #1786 "scripts out, agents in"): one competitor/adjacent-product move per
 * venture, turned into a gap + build plan — same shape as the other three areas above,
 * so it lands in the same axon_research_findings row and the same Executive handoff.
 * Cadence stays Mon/Wed/Fri (the old script's schedule) as a LANE-LEVEL day check —
 * this does not change the AXON Research cron itself (still Mon/Wed/Fri/Sat).
 */
export const COMPETITOR_LANE_ID = 'competitor_gap_build';
const COMPETITOR_LANE_DAYS = [1, 3, 5]; // UTC Mon/Wed/Fri, matches the retired scan's schedule

/** True only on the lane's scheduled days — a lane-level gate, never a new cron. */
export function isCompetitorLaneDay(date = new Date()) {
  return COMPETITOR_LANE_DAYS.includes(date.getUTCDay());
}

/** Rotate through the live venture list by day-of-year so every venture gets covered over time. */
export function pickCompetitorVenture(ventures, date = new Date()) {
  if (!ventures?.length) return null;
  const dayOfYear = Math.floor((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 0))) / 86400000);
  return ventures[dayOfYear % ventures.length];
}

/**
 * Honest skip result for the competitor lane when zero sources came back.
 * BPA-FOLLOWUP-COMPETITOR-LANE-NO-SOURCE-0906: the zero-source prompt tells the
 * model to "reason from established, well-known research/product patterns" —
 * fine for the other three areas, but for competitor that's a fabricated-
 * competitor risk (an invented company/feature presented as a real finding).
 * So the competitor area never reaches synthesizeArea (no model call) when its
 * sources are empty — it emits this skip row instead, and the caller records
 * it as a skip, not a plan.
 */
export function buildCompetitorSkipResult(reason = 'no sources') {
  return {
    area: COMPETITOR_LANE_ID,
    skipped: true,
    reason,
    finding: `Competitor lane skipped this run — ${reason}. No model call made, nothing invented.`,
    equivalent_or_signal: null,
    build_plan: null,
    plain_english: `Skipped the competitor check today — ${reason}. Rather than guess at a competitor, AXON just sat this one out. Will try again next scheduled run.`,
    source_urls: [],
    _provider: 'skipped',
  };
}

/** Build this run's competitor area for one venture — same {label, query, instruction} shape as THREE_AREAS. */
export function buildCompetitorArea(venture) {
  const name = venture?.name || venture?.slug || 'this venture';
  return {
    id: COMPETITOR_LANE_ID,
    label: `Competitor → gap build plan (${name})`,
    query: `${name} competitor alternative 2026 launch feature news`,
    instruction:
      `Find one real, recent move by a competitor or adjacent product to ${name}` +
      `${venture?.venture ? ` (${venture.venture})` : ''}. Identify one specific capability or ` +
      'feature they have that this venture does not yet, and turn it into a concrete build plan ' +
      'AXON/NVG could ship — never invent a competitor or a move that is not in the sources below.',
  };
}

const SYNTHESIS_SYSTEM =
  'You are AXON self-research for Northside (NVG). Every finding becomes a concrete, buildable plan ' +
  '— never "worth exploring." Return JSON only, no prose outside the JSON.';

export async function searchWeb(serpApiKey, query) {
  // WEB-SEARCH-FALLBACK-0906: shared door, free fallback when SerpApi is out of quota.
  return webSearchRows(serpApiKey, query, 5);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SYNTHESIS_RETRY_DELAY_MS = 2000;

/**
 * ONE ROUTER (2026-09-06): one call into the locked chain in
 * lib/axon-router-core.mjs (local -> RunPod -> OpenRouter free -> Gemini ->
 * Anthropic last), then the honest heuristic row if the whole chain is
 * unreachable. Never throws. `_provider` still names the lane that answered.
 *
 * AX-SYNTHESIS-CASCADE-RETRY-0907 (AXON-COMPETITOR-LANE-PROVIDER-0907): the router
 * chain (axonGenerate in axon-router-core.mjs) already walks all 5 tiers with real
 * per-tier error visibility and throws one error carrying every tier's reason — but
 * this caller only ever called it ONCE. A whole-chain miss (the mini briefly
 * unreachable, RunPod cold, a rate-limit blip on every free tier at the same moment)
 * fell straight to the heuristic row with no second try, even though the calling
 * script (scripts/axon-self-research.mjs) already has its own multi-attempt retry
 * loop — that loop never got a chance to fire here because synthesizeArea always
 * "succeeds" (returns a heuristic result instead of throwing). `maxAttempts` gives
 * the chain one extra full pass at the area level before conceding: cheap (only
 * runs when the first attempt already failed), scoped to this one caller, and it
 * does not touch axon-router-core.mjs's own per-tier logic at all.
 *
 * The second, separate bug this closes: `_cascade_errors` used to be computed here
 * but the caller (runThreeAreaResearch, below) never wrote it into the persisted
 * axon_research_findings row — so the one durable record of "no AI cascade reachable
 * this run" carried no detail on which tier(s) actually failed and why. Every
 * attempt's full error text (err.message already carries axonGenerate's per-tier
 * breakdown, e.g. "local: ... | runpod: ... | openrouter: ... | gemini: ... |
 * anthropic: ...") is now kept, unsliced, so the row is self-explanatory.
 */
export async function synthesizeArea({
  area,
  sources,
  jspaceContext,
  supabaseKey,
  generate = generateViaRouter,
  maxAttempts = 2,
  retryDelayMs = SYNTHESIS_RETRY_DELAY_MS,
}) {
  const prompt = buildAreaPrompt(area, sources, jspaceContext);
  const errors = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const out = await generate(supabaseKey, {
        system: SYNTHESIS_SYSTEM,
        user: prompt,
        kind: 'reasoning_planning',
        agentName: 'axon-self-research',
        maxTokens: 900,
        jsonMode: true,
      });
      return { ...extractJson(out.text), _provider: out.source, _model: out.model };
    } catch (err) {
      errors.push(`attempt ${attempt}/${maxAttempts}: ${err.message}`);
      if (attempt < maxAttempts) await sleep(retryDelayMs);
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
      steps: ['Re-run once the model chain is reachable'],
      effort: 'small',
      priority: 'low',
    },
    plain_english: `Couldn't fully think this one through today — ${area.label.toLowerCase()} — will try again next run.`,
    source_urls: top?.link ? [top.link] : [],
    _provider: 'heuristic',
    // Full per-attempt detail, never truncated — this is what makes a fallback
    // investigable from the finding row alone instead of needing a separate
    // axon_cost_ledger / router-log correlation pass after the fact.
    _cascade_errors: errors,
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
  serpApiKey,
  operatorId = 'default',
  dryRun = false,
  budgetCheck = () => false, // returns true when time budget is exhausted
  generate = generateViaRouter,
  now = new Date(),
  loadVentures = loadVentureList,
  search = searchWeb,
  // Forwarded to synthesizeArea when set — lets tests run instantly (retryDelayMs: 0)
  // and gives ops a knob without changing axon-router-core.mjs's own tier logic.
  maxAttempts,
  retryDelayMs,
}) {
  let jspace = await getJspaceState(sbSelect, operatorId);
  const jspaceContext = formatJspaceForPrompt(jspace);

  // Competitor lane (BPA A2): lane-level day gate, not a new cron. Runs Mon/Wed/Fri,
  // same schedule as the retired axon-competitor-scan.mjs it folds in.
  const areas = [...THREE_AREAS];
  let competitorLaneNote = null;
  if (isCompetitorLaneDay(now)) {
    try {
      const ventures = await loadVentures(sbSelect);
      const venture = pickCompetitorVenture(ventures, now);
      if (venture) {
        areas.push(buildCompetitorArea(venture));
      } else {
        competitorLaneNote = 'competitor lane skipped: no ventures found in content_machine_brand_profiles';
      }
    } catch (err) {
      competitorLaneNote = `competitor lane skipped: venture list unavailable (${err.message})`;
    }
  } else {
    competitorLaneNote = 'competitor lane not scheduled today (runs Mon/Wed/Fri)';
  }
  if (competitorLaneNote) console.log(competitorLaneNote);

  const results = [];
  let stoppedEarly = null;

  for (const area of areas) {
    if (budgetCheck()) {
      stoppedEarly = area.id;
      console.log(`⏳ Time budget hit before "${area.label}" — will resume next scheduled run.`);
      break;
    }

    console.log(`Researching: ${area.label}`);
    const sources = await search(serpApiKey, area.query);

    // BPA-FOLLOWUP-COMPETITOR-LANE-NO-SOURCE-0906: competitor + zero sources ->
    // honest skip, no model call. Fabricated-competitor risk is specific to this
    // area; the other three keep reasoning from well-known patterns as before.
    const isCompetitorNoSource = area.id === COMPETITOR_LANE_ID && sources.length === 0;
    const result = isCompetitorNoSource
      ? buildCompetitorSkipResult('no sources')
      : await synthesizeArea({
          area,
          sources,
          jspaceContext,
          supabaseKey,
          generate,
          ...(maxAttempts != null ? { maxAttempts } : {}),
          ...(retryDelayMs != null ? { retryDelayMs } : {}),
        });

    if (isCompetitorNoSource) {
      console.log(`  -> competitor lane skipped: no sources (no model call)`);
    } else {
      console.log(`  -> provider=${result._provider || 'unknown'} priority=${result.build_plan?.priority || '?'}`);
    }
    results.push({ area, sources, result });

    if (!dryRun) {
      const row = await sbInsert('axon_research_findings', {
        operator_id: operatorId,
        research_lane: area.id,
        title: `${area.label}: ${String(result.finding || '').slice(0, 100)}`,
        summary: result.finding || '',
        source_urls: result.source_urls || [],
        implementation_hint: result.skipped ? null : result.build_plan?.what_to_build || null,
        priority: result.skipped ? 'low' : result.build_plan?.priority || 'medium',
        status: result.skipped ? 'skipped' : 'new',
        jspace_relevance: result.equivalent_or_signal || null,
        brain_gap_category:
          area.id === 'neuroscience_build'
            ? 'architecture'
            : area.id === 'psychology_ux'
              ? 'selfhood'
              : area.id === COMPETITOR_LANE_ID
                ? 'competitive'
                : 'learning',
        meta: {
          synthesized_at: new Date().toISOString(),
          area: area.id,
          skipped: result.skipped || false,
          skip_reason: result.reason || null,
          build_plan: result.skipped ? null : result.build_plan || null,
          plain_english: result.plain_english || null,
          provider: result._provider || null,
          // AXON-COMPETITOR-LANE-PROVIDER-0907: per-attempt/per-tier failure detail,
          // present whenever the run fell to heuristic — was computed in
          // synthesizeArea but previously discarded before it ever reached this row.
          cascade_errors: result._cascade_errors?.length ? result._cascade_errors : null,
        },
      }).catch((err) => {
        console.log(`⚠️ axon_research_findings insert failed for ${area.id}: ${err.message}`);
        return null;
      });
      // Skip rows are gather-only — nothing gets queued for implementation.
      if (!result.skipped) {
        jspace = enqueueImplementation(jspace, {
          title: `${area.label}: ${result.build_plan?.what_to_build || result.finding}`,
          summary: result.finding,
          implementation_hint: result.build_plan?.what_to_build,
          priority: result.build_plan?.priority || 'medium',
          id: row?.id,
          research_lane: area.id,
        });
      }
      jspace = postConcept(jspace, {
        label: `${area.label}`.slice(0, 72),
        detail: (result.equivalent_or_signal || result.finding || '').slice(0, 220),
        priority: result.skipped ? 'low' : result.build_plan?.priority || 'medium',
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
  const summary = `AXON self-research (3-area build plans): ${results.length}/${areas.length} area(s) done` +
    (stoppedEarly ? `, stopped at "${stoppedEarly}" (time budget)` : '') +
    (competitorLaneNote ? ` — ${competitorLaneNote}.` : '') +
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
        competitor_lane_note: competitorLaneNote,
        job_fix: 'AXON-3-JOBS-REBUILD-0826',
      },
    }).catch((err) => {
      console.log(`⚠️ lab-log write failed: ${err.message}`);
      return null;
    });
  }

  return { results, stoppedEarly, allHeuristic, summary, runId: runRow?.id, jspace, competitorLaneNote };
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
