---
type: reference
id: LEARN-9978-learned-build-2026-09-24-gate
title: BUILD 2026-09-24: Gate-proof file missing in 5 of 6 repos and stale (2
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#9978 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: Gate-proof file missing in 5 of 6 repos and stale (2 days old, not this run) in the other 2 — why: The startup check that writes the gate-proof file is not firing fresh in a scheduled run for most repos — fix now in place: This run did not rely on protection it could not confirm was live, and did not attempt unsupervised merges or mass ticket clearance

Why: Auto-drafted by learnings-applier-agent from Learnings row 9978 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
