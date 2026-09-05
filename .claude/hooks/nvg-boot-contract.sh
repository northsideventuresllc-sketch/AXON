#!/bin/bash
# NVG BOOT CONTRACT — harness-enforced SessionStart hook, identical in every NVG repo
# (locked-rule-sync; canonical copy nv-vault/.claude/hooks/nvg-boot-contract.sh).
# Injected by the harness on every session start AND every compaction-resume, so it
# cannot be evicted the way skill text can. It is the mechanical form of JB's
# 2026-09-05 orders: graph + loop engineering automatic, goal + done on every task,
# council + stress test on every sub-task, agents check each other's work.
set -euo pipefail
cat <<'CONTRACT'
NVG EVERY-TASK CONTRACT (harness-enforced; the Stop gate checks 1, 6 and 7 mechanically):
1. GOAL + DONE FIRST — before any tool call on a real task, write one line: the deliverable(s) and the checkable proof of done for each. Even small tasks.
2. GRAPH ENGINEERING IS THE DEFAULT — fan out for looking, single thread for deciding, one sub-agent per independent piece, depth <= 2. The agent that did the work never verifies it: a different agent checks the artifact.
3. VENTURE WORK = VENTURE SUB-AGENT — global rules -> your agent rules -> the venture's rules, read from the venture map, never guessed.
4. COUNCIL + STRESS TEST ON EVERY SUB-TASK — no sub-task is "done" until an independent lens reviewed it AND it was exercised through the path the operator uses (open the page, call the endpoint, run the command). Merge/deploy only through the council gate.
5. NEVER SKIP A QUEUED ITEM — real progress, or council dispatched, or JB pinged with a real decision brief. Ten genuinely different routes before "blocked".
6. PLAIN ENGLISH TO JB — short lines, bold the key word, most important first. No table/column names, ids, hashes, paths, SQL, or backend words in anything JB reads (code goes in fenced blocks). The Stop gate blocks a message that breaks this.
7. CLOSE THE LOOP, MECHANICALLY — before ending, run `node .claude/hooks/nvg-close.mjs --json '{...}'` with: what worked, what broke, why (root cause), the fix now in place, how many routes were tried on anything blocked, what regressed, any instruction change needed (goes to ARCEUS -> council -> Telegram only if JB must decide), deliverables + proof, carry-forward. The Stop gate blocks a working session that has not done this.
CONTRACT
