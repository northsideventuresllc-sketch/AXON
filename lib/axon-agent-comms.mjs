/**
 * AXON research-family agent comms — shared by Self-Research (this repo) and
 * Competitor-Scan / Training-Ingest (nv-vault repo, duplicated there since
 * they're separate git trees — same small API on purpose).
 *
 * JB direct order 2026-08-26 (AXON-3-JOBS-REBUILD): every research-type job
 * (1) hands its output to the AXON Executive via agent_bus,
 * (2) self-flags for resume within ~12h if it hits a time/scope limit,
 * (3) loop-engineers — logs what worked/didn't so the next run applies it,
 * (4) sends genuinely urgent alerts to JB via Telegram only, never routine noise.
 *
 * Every function takes the caller's sbSelect/sbInsert/sbPatch (from
 * lib/supabase.mjs's createSupabaseClient, which throws on non-2xx) so this
 * file never needs its own Supabase key handling and every failure here is
 * caught locally — a comms hiccup must never take down the research run.
 */

import { sendToJb } from './jb-route.mjs';

/** Hand a finished piece of research off to another agent (default: AXON Executive). */
export async function handoffToAgent(sbInsert, { fromAgent, toAgent, subject, body, needsAnswer = true }) {
  try {
    const row = await sbInsert('agent_bus', {
      from_agent: fromAgent,
      to_agent: toAgent,
      subject,
      body,
      needs_answer: needsAnswer,
      status: 'open',
    });
    console.log(`✅ agent_bus: ${fromAgent} → ${toAgent} — ${subject}`);
    return row;
  } catch (err) {
    console.log(`⚠️ agent_bus insert failed (${fromAgent} → ${toAgent}): ${err.message}`);
    return null;
  }
}

/** Urgent-only. Never for routine status — that stays in agent_bus / vault. */
export async function telegramAlert(sbSelect, text, opts = {}) {
  // TELEGRAM-ROUTING-FIX-0905: lands in the calling agent's topic inside the
  // NVG Agents group (EXEC's topic when the agent has none), never JB's private
  // chat — that chat keeps only the daily wrap and the AXON conversation.
  try {
    const ok = await sendToJb(sbSelect, text, { agentName: opts.agentName || 'AXON Research' });
    console.log(ok ? '✅ Telegram alert sent' : '⚠️ Telegram alert skipped — bot or chat not reachable');
    return ok;
  } catch (err) {
    console.log(`Telegram alert threw: ${err.message}`);
    return false;
  }
}

/**
 * Self-rescheduling: flag this routine to resume within `hours`, then exit
 * clean (not a failure). axon-resume-scheduler.yml (nv-vault, hourly) reads
 * nvg_agent_routines.wake_config.resume_needed_at across all three research
 * jobs cross-repo and re-dispatches the matching workflow once it's due.
 */
export async function flagResumeNeeded(sbSelect, sbPatch, routineId, reason, hours = 12) {
  try {
    const resumeAt = new Date(Date.now() + hours * 3600000).toISOString();
    const rows = await sbSelect(
      'nvg_agent_routines',
      `routine_id=eq.${encodeURIComponent(routineId)}&select=wake_config&limit=1`
    );
    const wakeConfig = rows?.[0]?.wake_config || {};
    await sbPatch('nvg_agent_routines', `routine_id=eq.${encodeURIComponent(routineId)}`, {
      wake_config: { ...wakeConfig, resume_needed_at: resumeAt, resume_reason: reason },
      updated_at: new Date().toISOString(),
    });
    console.log(`⏳ Flagged ${routineId} to resume by ${resumeAt} — ${reason}`);
  } catch (err) {
    console.log(`flagResumeNeeded failed: ${err.message}`);
  }
}

export async function clearResumeFlag(sbSelect, sbPatch, routineId) {
  try {
    const rows = await sbSelect(
      'nvg_agent_routines',
      `routine_id=eq.${encodeURIComponent(routineId)}&select=wake_config&limit=1`
    );
    const wakeConfig = { ...(rows?.[0]?.wake_config || {}) };
    delete wakeConfig.resume_needed_at;
    delete wakeConfig.resume_reason;
    await sbPatch('nvg_agent_routines', `routine_id=eq.${encodeURIComponent(routineId)}`, {
      wake_config: wakeConfig,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.log(`clearResumeFlag failed: ${err.message}`);
  }
}

/** Loop-engineering: what did the LAST run of this job say worked/didn't. */
export async function readLastLoopNote(sbSelect, jobTag) {
  try {
    const rows = await sbSelect(
      'Learnings',
      `learning=ilike.*${encodeURIComponent(`[LOOP:${jobTag}]`)}*&order=date.desc&limit=1&select=learning,date`
    );
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

/** Loop-engineering: write what worked/didn't THIS run, for the next run to read and apply. */
export async function writeLoopNote(sbInsert, jobTag, { worked = [], didntWork = [], applyNext = [] } = {}) {
  const summary = [
    `[LOOP:${jobTag}] ${new Date().toISOString().slice(0, 10)}`,
    worked.length ? `Worked: ${worked.join(' | ')}` : null,
    didntWork.length ? `Didn't work: ${didntWork.join(' | ')}` : null,
    applyNext.length ? `Apply next run: ${applyNext.join(' | ')}` : null,
  ]
    .filter(Boolean)
    .join(' — ');
  try {
    await sbInsert('Learnings', {
      learning: summary,
      source: jobTag,
      date: new Date().toISOString(),
      category: 'axon-loop-engineering',
      project: 'AXON',
    });
  } catch (err) {
    console.log(`writeLoopNote failed: ${err.message}`);
  }
  return summary;
}
