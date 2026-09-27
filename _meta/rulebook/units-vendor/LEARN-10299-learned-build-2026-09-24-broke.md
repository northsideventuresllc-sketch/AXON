---
type: reference
id: LEARN-10299-learned-build-2026-09-24-broke
title: BUILD 2026-09-24: broke — Council merge-gate reported bypassable and t
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10299 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: broke — Council merge-gate reported bypassable and the reaper falsely requeues already-shipped tickets (LRNB-T05-COUNCIL-REAPER-BUGS-0924, filed today, priority 1, unresolved) | Two concurrent agent sessions can claim and act on the same ticket with contradictory results — no session-identity lock exists (BUILD-SESSION-AWARE-BUS-CLAIM-LOCK-0914, unresolved)

Why: Auto-drafted by learnings-applier-agent from Learnings row 10299 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
