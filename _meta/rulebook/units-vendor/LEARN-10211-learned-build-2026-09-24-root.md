---
type: reference
id: LEARN-10211-learned-build-2026-09-24-root
title: BUILD 2026-09-24: root causes observed — The merge-queue tickets (W2-M
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10211 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: root causes observed — The merge-queue tickets (W2-MERGE-*) are inserted when a pull request opens and are not re-checked for continued validity before a merge run picks them up, so a duplicate fix landing via a separate pull request leaves a stale, now-unmergeable ticket sitting in the queue looking actionable

Why: Auto-drafted by learnings-applier-agent from Learnings row 10211 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
