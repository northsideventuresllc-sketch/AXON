---
type: reference
id: LEARN-10244-learned-build-2026-09-24-a
title: BUILD 2026-09-24: A nvg_pr_council_reviews verdict=pass row does not i
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10244 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: A nvg_pr_council_reviews verdict=pass row does not imply a PR is safe to merge -- 4/4 spot-checked nv-vault pass rows were still draft:true, 2 of those also had real merge conflicts (mergeable_state=dirty) — why: The council-review gate scores diff quality/content only; it never checks GitHub draft status, mergeable_state, or whether the PR head branch even targets main (one of the four targeted a feature branch, not main) — fix now in place: No code fix shipped this run -- flagged as a Learning (STALE-PROMPT) recommending scripts/merge-pr.mjs and/or the ship step in BUILD.md require draft=false and mergeable_state=clean before treating a pass row as actionable; routed to ARCEUS via instruction_change below rather than self-applied

Why: Auto-drafted by learnings-applier-agent from Learnings row 10244 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
