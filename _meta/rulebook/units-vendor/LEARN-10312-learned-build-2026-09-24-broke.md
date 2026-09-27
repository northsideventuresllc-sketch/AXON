---
type: reference
id: LEARN-10312-learned-build-2026-09-24-broke
title: BUILD 2026-09-24: broke — The W2-MERGE ticket queue is treating a pass
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10312 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: broke — The W2-MERGE ticket queue is treating a passing council review as equivalent to ready-to-land: 8 of 12 tickets marked ready to merge were actually still-draft PRs, several stacked behind other unmerged PRs (AXON #258/#260 chain, nv-vault #562/#566/#577 chain) | AXON#259 got a new commit pushed after its council review ran (live head 60da6221... vs reviewed 511860c1...), so the recorded pass no longer covers the PR's current state

Why: Auto-drafted by learnings-applier-agent from Learnings row 10312 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
