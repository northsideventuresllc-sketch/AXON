#!/bin/bash
# NVG BOOT CONTRACT — harness-enforced SessionStart hook, identical in every NVG repo
# (locked-rule-sync; canonical copy nv-vault/.claude/hooks/nvg-boot-contract.sh).
# Injected by the harness on every session start AND every compaction-resume, so it
# cannot be evicted the way skill text can. It is the mechanical form of JB's
# 2026-09-05 orders: graph + loop engineering automatic, goal + done on every task,
# council + stress test on every sub-task, agents check each other's work.
set -euo pipefail
# BOOT SENTINEL (ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908) — this hook only runs at all
# when Claude Code actually loaded a SessionStart hook for this session (i.e. gates are
# wired). A fired/scheduled session rooted at a multi-repo workspace parent with no
# .claude/settings.json there never runs this file, so it never gets a sentinel — that
# absence is the signal. Written under $CLAUDE_PROJECT_DIR (the session's real project
# root, not necessarily this repo) so a same-session check finds it regardless of which
# repo's copy of this hook fired. See CLAUDE.md boot contract "PROOF OF GATE" step, which
# checks for this file's existence before claiming mechanical enforcement is active.
SENTINEL_DIR="${CLAUDE_PROJECT_DIR:-.}/.nvg"
mkdir -p "$SENTINEL_DIR" 2>/dev/null || true
date -u +%Y-%m-%dT%H:%M:%SZ > "$SENTINEL_DIR/boot-contract-fired-at" 2>/dev/null || true
# MECHANICAL PRESENCE UPSERT (PULSE-PRESENCE-UPSERT-NOT-MECHANICAL-0913) — BOOT v2 step 5
# ("Upsert nvg_agent_presence at boot") was prose an agent had to remember; this makes it
# fire every session/compaction-resume automatically. See nvg-presence-upsert.mjs for the
# full mechanic. Bounded + fail-open on purpose: never lets a missing key, a slow network,
# or a missing node/timeout binary delay or block printing the contract below.
HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if command -v node >/dev/null 2>&1; then
  if command -v timeout >/dev/null 2>&1; then
    timeout 6s node "$HOOKS_DIR/nvg-presence-upsert.mjs" >/dev/null 2>&1 || true
  else
    node "$HOOKS_DIR/nvg-presence-upsert.mjs" >/dev/null 2>&1 || true
  fi
fi
cat <<'CONTRACT'
NVG EVERY-TASK CONTRACT (harness-enforced; the PreToolUse gate checks item 0 mechanically, the Stop gate checks 6 and 7 mechanically, as of 2026-09-07 — items 2-5 are still binding law read at every boot, not yet gated):
0. TICKETS FIRST — CLEAR EVERY OWNED TICKET TO COMPLETION BEFORE YOUR OWN TASK (JB direct order, locked 2026-09-07). MECHANICALLY ENFORCED as of 2026-09-07 by `.claude/hooks/nvg-tickets-first-gate.mjs` (PreToolUse) — it blocks your first tool call once per open, un-acknowledged ticket, oldest first, naming it; acknowledge with `--ack <id>` (claim + work it, or park it with the real reason) and it does not re-block that ticket. THIS GATE READS YOUR AGENT NAME FROM NVG_AGENT_NAME OR FROM A STATE FILE, NOT FROM GUESSING: the moment you know your own canonical name (from your prompt, or from v_bus_inbox), run `node scripts/nvg-set-agent-name.mjs <YOUR NAME>` once so the gate can enforce even in a fired session with no NVG_AGENT_NAME env var (ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908). On boot, list your open tickets and work them oldest-first until the count is ZERO; only then do your own duties. Each ticket runs the full every-task workflow below — goal+done, graph engineering when it needs more than one lane, council the moment you are stuck. If council cannot resolve it, ping JB with a real decision brief. WHEN AN ANSWER COMES BACK FROM ANYONE — JB, council, or an agent you fired — YOU AUTOMATICALLY RESUME THAT TICKET AND DRIVE IT TO COMPLETION. An answer is never the end; completion is. A ticket is never left touched-but-open. BUG TRIAGE, EVERY TIME YOU OR A SUB-AGENT SPOT A BUG: decide — does it harm workflow, or is it minor and can wait? Harms workflow -> FIRE the right agent for it RIGHT THEN (operator-core §7A fire keys / the DB fire path), never queue a workflow-breaking bug. Minor -> file it as a ticket in the owning agent's inbox so it is tracked and cleared on that agent's next boot, never left loose to pile up. Every agent must know how to fire another agent immediately AND where minor tickets go.
1. GOAL + DONE FIRST — before any tool call on a real task, write one line: the deliverable(s) and the checkable proof of done for each. Even small tasks.
2. GRAPH ENGINEERING IS THE DEFAULT — fan out for looking, single thread for deciding, one sub-agent per independent piece, depth <= 2. The agent that did the work never verifies it: a different agent checks the artifact.
3. VENTURE WORK = VENTURE SUB-AGENT — global rules -> your agent rules -> the venture's rules, read from the venture map, never guessed.
4. COUNCIL + STRESS TEST ON EVERY SUB-TASK — no sub-task is "done" until an independent lens reviewed it AND it was exercised through the path the operator uses (open the page, call the endpoint, run the command). Merge/deploy only through the council gate.
5. NEVER SKIP A QUEUED ITEM — real progress, or council dispatched, or JB pinged with a real decision brief. Ten genuinely different routes before "blocked".
6. PLAIN ENGLISH TO JB — short lines, bold the key word, most important first. No table/column names, ids, hashes, paths, SQL, or backend words in anything JB reads (code goes in fenced blocks). The Stop gate blocks a message that breaks this.
7. CLOSE THE LOOP, MECHANICALLY — before ending, run `node .claude/hooks/nvg-close.mjs --json '{...}'` with: what worked, what broke, why (root cause), the fix now in place, how many routes were tried on anything blocked, what regressed, any instruction change needed (goes to ARCEUS -> council -> Telegram only if JB must decide), deliverables + proof, carry-forward. The Stop gate blocks a working session that has not done this.
CONTRACT
