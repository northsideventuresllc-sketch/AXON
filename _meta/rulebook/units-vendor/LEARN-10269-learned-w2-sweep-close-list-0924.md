---
type: reference
id: LEARN-10269-learned-w2-sweep-close-list-0924
title: W2-SWEEP-CLOSE-LIST-0924/W2-SWEEP-BACKLOG-METHOD-0924: the unmerged-br
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10269 (orchestrator-lane-2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] W2-SWEEP-CLOSE-LIST-0924/W2-SWEEP-BACKLOG-METHOD-0924: the unmerged-branch backlog sweep pattern that works is one W2-REVIEW-<repo>-<pr#> ticket per opened PR (103 filed today), plus explicit close-with-explanation for branches whose fix already shipped a different way (Learnings 10208/10212) -- but at ~1,050 branches org-wide with no PR yet, one-ticket-per-branch does not scale; the safe first slice is a mechanical true-no-diff auto-close pass (git push --delete on branches with zero diff vs current main), which needs no review at all.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10269 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
