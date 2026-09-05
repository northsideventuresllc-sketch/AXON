#!/usr/bin/env node
/**
 * AXON Skill Candidate Scout — AX-SMALL-BUILDS-BUNDLE-0904 item (3).
 *
 * Reads recent `session_notes_apartment` rows, finds phrases that repeat
 * across enough distinct notes to look like a real pattern (see
 * lib/axon-skill-candidate-scout-core.mjs for the mechanical, no-LLM
 * heuristic), and PROPOSES golden_skills candidates. It never writes to
 * `golden_skills` and never registers anything — output is:
 *   1. `qa/skill-candidates/PROPOSALS.md` — a running, "shows its work" log
 *      (same rolling-entry style as qa/QA.md from item 1), committed on the
 *      same `qa-log` branch as the deploy-QA log (see .github/workflows/
 *      axon-deploy-qa.yml's header for why that branch exists — main here
 *      requires the "council-review" status check, so a bot never pushes
 *      straight to it).
 *   2. one row to NI-Brain `Learnings` summarizing the run.
 *   3. if a persona/new-agent need is detected in the text (see
 *      PERSONA_HINT_RE in the core file), that is called out as a
 *      FLAG-FOR-ARCEUS line in both the artifact and the console output —
 *      not built, not registered, just flagged, per the dispatch's explicit
 *      instruction.
 *
 * Chat-log ingestion (the "and/or chat logs" half of the dispatch text) is
 * deliberately NOT wired in this v1: this repo has several different chat-ish
 * surfaces (axon_agent_messages, the Slack mirror, Telegram messages, all
 * unioned in v_agent_comms_feed per lib/axon-v0/agent-comms.ts) and picking
 * the right slice of "JB's own words" out of that mix is a judgment call this
 * PR does not make speculatively. session_notes_apartment alone (every
 * agent's own run summaries, which already routinely quote or paraphrase what
 * JB asked for) is a reasonable, narrower v1 source. Extending to a chat
 * surface is a natural, scoped follow-up, not a redesign.
 *
 * session_notes_apartment column note: lib/axon-agent-boot.mjs reads this
 * table's text column as `raw_note`; scripts/backlog-janitor.mjs writes it as
 * `note`. Both names are read defensively below (row.raw_note ?? row.note)
 * since this PR's author had no live-schema access to confirm which is real
 * — see the PR body for the same caveat on item (2)'s schema assumption.
 *
 * Usage:
 *   node scripts/axon-skill-candidate-scout.mjs [--days=14] [--dry]
 *
 * Env:
 *   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY — required (unless --dry)
 *
 * SAFETY: reads axon_cron_jobs.enabled via cronGuardShouldSkip (JOB_ID below),
 * same fail-open convention as every other AXON job — no seed row exists yet.
 * Rollback: add an axon_cron_jobs row {id:'axon-skill-candidate-scout',
 * enabled:false}, or just stop invoking this script (it is not wired to any
 * schedule in this PR — see the PR body for why: the dispatch asked for "a
 * routine/script," not a new cron workflow, so none was added).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSupabaseClient } from '../lib/supabase.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import {
  analyzeNotesForSkillCandidates,
  renderScoutEntry,
  withNewScoutEntry,
  buildScoutLearningRow,
} from '../lib/axon-skill-candidate-scout-core.mjs';

const JOB_ID = 'axon-skill-candidate-scout';
const DEFAULT_LOOKBACK_DAYS = 14;
const ARTIFACT_PATH = join('qa', 'skill-candidates', 'PROPOSALS.md');
const JSON_ARTIFACT_PATH = join('qa', 'skill-candidates', 'latest.json');

function parseArgs(argv) {
  const dry = argv.includes('--dry') || process.env.AXON_DRY_RUN === '1';
  const daysArg = argv.find((a) => a.startsWith('--days='));
  const days = daysArg ? Number(daysArg.split('=')[1]) : DEFAULT_LOOKBACK_DAYS;
  return { dry, days: Number.isFinite(days) && days > 0 ? days : DEFAULT_LOOKBACK_DAYS };
}

function noteText(row) {
  return row?.raw_note ?? row?.note ?? '';
}

async function fetchRecentNotes(sb, days) {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await sb.sbSelect(
    'session_notes_apartment',
    `created_at=gt.${encodeURIComponent(sinceIso)}&order=created_at.desc&select=id,note,raw_note,workspace_type,created_at&limit=500`,
  );
  return (rows || []).map((r) => ({ id: r.id, text: noteText(r), created_at: r.created_at }));
}

function writeArtifactsLocally({ repoRoot, entryMarkdown, result }) {
  const dir = join(repoRoot, 'qa', 'skill-candidates');
  try {
    mkdirSync(dir, { recursive: true });
    const mdPath = join(repoRoot, ARTIFACT_PATH);
    const existing = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';
    writeFileSync(mdPath, withNewScoutEntry(existing, entryMarkdown));

    const jsonPath = join(repoRoot, JSON_ARTIFACT_PATH);
    writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2));
    return { skipped: false, mdPath, jsonPath };
  } catch (err) {
    return { skipped: true, reason: `write failed: ${err.message}` };
  }
}

async function main() {
  const { dry, days } = parseArgs(process.argv.slice(2));
  console.log(`AXON Skill Candidate Scout — lookback ${days}d${dry ? ' (dry run)' : ''}`);

  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key && !dry) throw new Error('SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required (or pass --dry)');

  let notes = [];
  let sb = null;
  if (key) {
    sb = createSupabaseClient(key);
    if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;
    notes = await fetchRecentNotes(sb, days);
  } else {
    console.log('No Supabase key — running with zero notes (dry-run smoke test only).');
  }

  const result = analyzeNotesForSkillCandidates(notes);
  const entryMarkdown = renderScoutEntry({ dateIso: new Date().toISOString().slice(0, 10), lookbackDays: days, result });
  console.log(entryMarkdown);

  if (result.personaFlags.length > 0) {
    console.log(
      `\nFLAG FOR ARCEUS: ${result.personaFlags.length} persona/new-agent need(s) detected — filed as a note only, not built. See the artifact for detail.`,
    );
  }

  const repoRoot = process.env.AXON_REPO_DIR || process.cwd();
  const writeResult = writeArtifactsLocally({ repoRoot, entryMarkdown, result });
  console.log(
    writeResult.skipped
      ? `Artifact write: SKIPPED (${writeResult.reason})`
      : `Artifact write: ok (${writeResult.mdPath}, ${writeResult.jsonPath}) — committing this is the calling workflow's job, not this script's`,
  );

  if (sb) {
    try {
      await sb.sbInsert('Learnings', buildScoutLearningRow({ result }));
      console.log('Learnings row: ok');
    } catch (err) {
      console.log(`Learnings row: FAILED (non-fatal, logged not faked): ${err.message}`);
    }
  } else {
    console.log('Learnings row: SKIPPED (no Supabase key / --dry run)');
  }

  console.log(
    `AXON Skill Candidate Scout complete — ${result.candidates.length} candidate(s), ${result.personaFlags.length} persona flag(s).`,
  );
}

main().catch((err) => {
  console.error('AXON Skill Candidate Scout failed:', err);
  process.exitCode = 1;
});
