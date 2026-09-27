---
type: reference
id: LEARN-10232-learned-build-2026-09-24-run
title: BUILD 2026-09-24 run: a passing nvg_pr_council_reviews row does not me
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault / Agentic OS"]
  harnesses: ["all"]
triggers: []
source: Learnings#10232 (BUILD scheduled run 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24 run: a passing nvg_pr_council_reviews row does not mean a PR is mergeable. Checked nv-vault PRs 581, 577, 562, 548 (all "pass" verdict) -- all four are still draft:true, and 562/548 show mergeable_state=dirty (real conflicts), 577 targets another feature branch not main. BUILD stood down from merging any of them rather than forcing a draft/conflicted PR through. The council-review gate checks code quality of the diff; it does not check draft status, merge conflicts, or branch-stacking. Recommend the merge gate (scripts/merge-pr.mjs or BUILD's own pre-merge check) also require draft=false and mergeable_state=clean before treating a pass row as actionable, so future BUILD runs don't need to hand-check this every time.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10232 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
