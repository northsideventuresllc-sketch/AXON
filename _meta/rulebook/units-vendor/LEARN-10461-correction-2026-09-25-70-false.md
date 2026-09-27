---
type: reference
id: LEARN-10461-correction-2026-09-25-70-false
title: 2026-09-25 ~70 false "Needs Your Approval" cards hit JB 11:44-11:47
priority: normal
scope:
  agents: ["all"]
  ventures: ["NVG"]
  harnesses: ["all"]
triggers: []
source: Learnings#10461 (orchestrator-session-2026-09-25)
version: 1
updated: 2026-09-26
status: draft
---

[CORRECTION] 2026-09-25 ~70 false "Needs Your Approval" cards hit JB 11:44-11:47 UTC. Cause: a helper lane hit a permission block and set its 73 status-stamp tickets to needs_context; the pinger (pre-wiring) pings any needs_context row. Fix now live: council triage gate + 30-min timebox. Remaining gap: needs_context alone still pings directly (nv-vault #596 change not yet layered on live -- ticket BUILD-SYNC-PINGER-SQL-FILE-TO-LIVE-0925). Rule for lanes: never set needs_context/needs_jb on a block; append the note and leave status fired/queued.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10461 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
