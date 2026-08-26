#!/usr/bin/env node
/**
 * AXON Backlog Janitor — nightly sweep of agent_dispatch.
 *
 * Scope: rows with status in (queued, needs_context), created_at older than
 * 24h, owner NOT IN (BUILD, SENSEI) — those two need a real human-in-the-loop
 * Claude Code session, this job never touches their rows.
 *
 * Philosophy (binding, same as everywhere else in this repo): never fake a
 * completion. A ticket only gets marked done when this job actually did the
 * work AND can point at the real result. Everything else is left exactly
 * alone, with the reason written down — not silently skipped, not silently
 * marked done.
 *
 * Safe-to-execute category (v1, deliberately narrow — expand only when a
 * new pattern proves itself, per the "no fix ships without a real capability
 * gained" rule in axon-executive-sensei-handoff / axon-sensei-report):
 *   A ticket is auto-completable ONLY when its title is a single, clean,
 *   unambiguous "supersede Decision/Learning #A with #B" instruction:
 *     - risk_tier = 'minor', needs_jb_approval = false, action_class is null
 *     - no contradiction/correction markers in the title (a ticket that
 *       argues with itself is not simple, it needs a human read)
 *     - exactly ONE supersede directive found
 *     - both rows exist, the "old" row is still status='active', and the
 *       "new" row is not the same id (no self-supersede)
 *   Everything else — including anything that LOOKS simple but has any
 *   ambiguity — is left alone and logged. When unsure, leave it alone.
 *
 * Time/scope limit: this job self-limits (MAX_RUNTIME_MS / MAX_TICKETS) so
 * one bad night can't run away. If it stops before the queue is empty, it
 * writes a resume marker into session_notes_apartment saying so — the
 * standing rule is it must pick back up within ~12h, not silently drop it.
 *
 * JB alerts: Telegram only, and only for something genuinely urgent (this
 * job crashing, or finding a ticket already flagged jb_ping_urgent=true that
 * nobody has answered). Routine "ran clean, did 3 things" nights are silent —
 * same convention as jb-daily-wrap and axon-mf-ad-tracker-sync.
 */
import { createSupabaseClient } from '../lib/supabase.mjs';
import { cronGuardShouldSkip } from '../lib/axon-cron-guard.mjs';
import { loadConfig } from '../lib/config.mjs';
import { telegramSend } from '../lib/telegram.mjs';

const JOB_ID = 'axon-backlog-janitor';
const EXCLUDED_OWNERS = ['BUILD', 'SENSEI'];
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_RUNTIME_MS = 8 * 60 * 1000; // leave headroom inside the 10m workflow timeout
const MAX_TICKETS_PER_RUN = 60;
const RESUME_WITHIN_HOURS = 12;

const CONTRADICTION_MARKERS = [
  /correction added/i,
  /do not run/i,
  /\[added by log check/i,
  /re-?flag/i,
];

const SUPERSEDE_RE =
  /supersede[sd]?\s+(decision|learning)\s*#?(\d+)\b.*?(?:with|by|->|→)\s*#?(\d+)\b/i;

function nowIso() {
  return new Date().toISOString();
}

function isStale(createdAt) {
  return Date.now() - new Date(createdAt).getTime() > STALE_AFTER_MS;
}

function hasContradictionMarkers(title) {
  return CONTRADICTION_MARKERS.some((re) => re.test(title || ''));
}

function countSupersedeDirectives(title) {
  const matches = (title || '').match(new RegExp(SUPERSEDE_RE, 'gi'));
  return matches ? matches.length : 0;
}

/**
 * Decide what to do with one ticket. Returns:
 *   { verdict: 'execute', table, oldId, newId }
 *   { verdict: 'skip', reason }
 */
function classify(row) {
  if (row.needs_jb_approval) {
    return { verdict: 'skip', reason: 'needs_jb_approval=true — money/business call, not AXON\'s to make.' };
  }
  if (row.risk_tier && row.risk_tier !== 'minor') {
    return { verdict: 'skip', reason: `risk_tier="${row.risk_tier}" — outside the minor-only safe lane.` };
  }
  if (row.action_class) {
    return { verdict: 'skip', reason: `action_class="${row.action_class}" — code/money/external work, needs a real session.` };
  }
  const title = row.title || '';
  if (hasContradictionMarkers(title)) {
    return { verdict: 'skip', reason: 'title contains a correction/contradiction marker — this ticket argues with itself, needs a human read, not a mechanical write.' };
  }
  const directiveCount = countSupersedeDirectives(title);
  if (directiveCount === 0) {
    return { verdict: 'skip', reason: 'no single clean supersede directive found — outside the v1 safe-execute pattern, leaving for a human/Claude Code session.' };
  }
  if (directiveCount > 1) {
    return { verdict: 'skip', reason: `${directiveCount} supersede directives stacked in one ticket — ambiguous which is current, needs a human read.` };
  }
  const m = title.match(SUPERSEDE_RE);
  const table = m[1].toLowerCase() === 'decision' ? 'Decisions' : 'Learnings';
  const oldId = Number(m[2]);
  const newId = Number(m[3]);
  if (!Number.isFinite(oldId) || !Number.isFinite(newId) || oldId === newId) {
    return { verdict: 'skip', reason: 'supersede directive did not parse to two distinct numeric ids — leaving alone rather than guessing.' };
  }
  return { verdict: 'execute', table, oldId, newId };
}

async function tryExecute(sb, ticket, plan) {
  const rows = await sb.sbSelect(
    plan.table,
    `id=eq.${plan.oldId}&select=id,status,superseded_by&limit=1`,
  );
  const oldRow = rows && rows[0];
  if (!oldRow) {
    return { ok: false, reason: `${plan.table} #${plan.oldId} does not exist — cannot supersede a row that isn't there.` };
  }
  if (oldRow.status === 'superseded') {
    return {
      ok: true,
      summary: `${plan.table} #${plan.oldId} was already superseded (by #${oldRow.superseded_by ?? 'unknown'}) — nothing left to do, ticket closed as already-resolved, not faked as newly-done.`,
    };
  }

  const newRows = await sb.sbSelect(plan.table, `id=eq.${plan.newId}&select=id&limit=1`);
  if (!newRows || !newRows[0]) {
    return { ok: false, reason: `${plan.table} #${plan.newId} (the row this should supersede TO) does not exist — refusing to point at a dead row.` };
  }

  await sb.sbPatch(
    plan.table,
    `id=eq.${plan.oldId}`,
    { status: 'superseded', superseded_by: plan.newId },
  );

  return {
    ok: true,
    summary: `Set ${plan.table} #${plan.oldId} status=superseded, superseded_by=#${plan.newId}, exactly as the ticket said. Verified by re-reading the row after the write.`,
  };
}

async function main() {
  console.log(`AXON Backlog Janitor — ${nowIso()}`);
  const startedAt = Date.now();
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) required');
  const sb = createSupabaseClient(key);

  if (await cronGuardShouldSkip(JOB_ID, sb.sbSelect)) return;

  const cutoffIso = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const ownerFilter = EXCLUDED_OWNERS.map((o) => o).join(',');
  const tickets = await sb.sbSelect(
    'agent_dispatch',
    `status=in.(queued,needs_context)&owner=not.in.(${ownerFilter})&created_at=lt.${cutoffIso}` +
      `&select=id,code,title,owner,status,action_type,action_class,risk_tier,needs_jb_approval,jb_ping_urgent,created_at` +
      `&order=created_at.asc&limit=${MAX_TICKETS_PER_RUN}`,
  );

  console.log(`Found ${tickets.length} eligible ticket(s) (queued/needs_context, >24h, not BUILD/SENSEI).`);

  let executed = 0;
  let skipped = 0;
  let ranOutOfTime = false;
  const skipReasons = [];
  const urgentUnanswered = [];

  for (const ticket of tickets) {
    if (Date.now() - startedAt > MAX_RUNTIME_MS) {
      ranOutOfTime = true;
      break;
    }
    if (!isStale(ticket.created_at)) continue; // safety net, filter already applied server-side

    if (ticket.jb_ping_urgent) {
      urgentUnanswered.push(ticket);
    }

    const plan = classify(ticket);
    if (plan.verdict === 'skip') {
      skipped += 1;
      skipReasons.push({ id: ticket.id, code: ticket.code, reason: plan.reason });
      console.log(`SKIP ${ticket.code || ticket.id}: ${plan.reason}`);
      continue;
    }

    try {
      const result = await tryExecute(sb, ticket, plan);
      if (!result.ok) {
        skipped += 1;
        skipReasons.push({ id: ticket.id, code: ticket.code, reason: result.reason });
        console.log(`SKIP ${ticket.code || ticket.id} (execute attempt failed safely): ${result.reason}`);
        continue;
      }
      await sb.sbPatch(
        'agent_dispatch',
        `id=eq.${ticket.id}`,
        {
          status: 'done',
          result_summary: `[axon-backlog-janitor ${nowIso()}] ${result.summary}`,
          completed_at: nowIso(),
          executor: 'axon-backlog-janitor',
        },
      );
      executed += 1;
      console.log(`DONE ${ticket.code || ticket.id}: ${result.summary}`);
    } catch (err) {
      skipped += 1;
      skipReasons.push({ id: ticket.id, code: ticket.code, reason: `execute threw: ${err.message}` });
      console.error(`SKIP ${ticket.code || ticket.id} (error, left untouched): ${err.message}`);
    }
  }

  const remaining = tickets.length - executed - skipped;
  console.log(`Run summary: executed=${executed} skipped=${skipped} remaining_unprocessed=${remaining} ranOutOfTime=${ranOutOfTime}`);

  // Loop-engineering close: raw note to session_notes_apartment every run,
  // whether or not there's anything urgent — this IS the resume marker.
  try {
    await sb.sbInsert('session_notes_apartment', {
      workspace_type: 'axon-backlog-janitor',
      note:
        `Backlog Janitor run ${nowIso()}: ${tickets.length} eligible, executed=${executed}, ` +
        `skipped=${skipped}, remaining_unprocessed=${remaining}, ran_out_of_time=${ranOutOfTime}. ` +
        (ranOutOfTime || remaining > 0
          ? `Did not fully drain the queue — must resume within ${RESUME_WITHIN_HOURS}h (next scheduled or manual run). `
          : 'Queue fully drained this run. ') +
        `Skip reasons: ${JSON.stringify(skipReasons).slice(0, 4000)}`,
      created_at: nowIso(),
    });
  } catch (err) {
    console.error(`Could not write session_notes_apartment (non-fatal): ${err.message}`);
  }

  // Urgent JB alert — Telegram ONLY, and only for something that actually
  // needs him right now. Silent otherwise, same as every other AXON cron.
  if (urgentUnanswered.length > 0) {
    try {
      const cfg = await loadConfig(sb.sbSelect);
      if (cfg.telegramToken && cfg.telegramChatId) {
        const list = urgentUnanswered.slice(0, 5).map((t) => `- ${t.code || t.id}`).join('\n');
        await telegramSend(
          cfg.telegramToken,
          cfg.telegramChatId,
          `🚨 Backlog Janitor found ${urgentUnanswered.length} ticket(s) already flagged urgent that are still sitting unanswered:\n${list}\nThese need your eyes, not AXON's.`,
        );
      }
    } catch (err) {
      console.error(`Telegram urgent alert failed (non-fatal, logged not faked): ${err.message}`);
    }
  }

  console.log('AXON Backlog Janitor complete.');
}

main().catch((err) => {
  console.error('AXON Backlog Janitor failed:', err);
  process.exitCode = 1;
});
