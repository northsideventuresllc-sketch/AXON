---
type: reference
id: LEARN-10315-stale-prompt-all-16-currently-queued
title: All 16 currently-queued W2-MERGE-* agent_dispatch tickets point a
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg-agentic-os"]
  harnesses: ["all"]
triggers: []
source: Learnings#10315 (BUILD)
version: 1
updated: 2026-09-25
status: draft
---

[STALE-PROMPT] All 16 currently-queued W2-MERGE-* agent_dispatch tickets point at PRs that are draft=true on GitHub, several with bodies explicitly stating "Do not merge" / "left as a draft PR per instructions" / "Draft, for COUNCIL review" — including PRs stacked on other unmerged branches (AXON #260 on #258, #262 on #260+#258; nv-vault #577 targets branch claude/p2-translator not main; #567 says merge only after #566). BUILD run 2026-09-24 (this session) checked every queued W2-MERGE ticket against live GitHub state before merging and found zero of the 16 are actually mergeable right now, despite each carrying a passing nvg_pr_council_reviews row for its head SHA. The council-pass gate is necessary but not sufficient — it does not check draft status, explicit do-not-merge text in the PR body, or unmet stacking order. No merges were performed this run. Whatever enqueues W2-MERGE tickets should check pr.draft===false and mergeable_state before filing one, or BUILD keeps burning cycles re-checking the same not-ready PRs every run.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10315 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
