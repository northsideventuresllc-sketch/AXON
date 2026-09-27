---
type: reference
id: LEARN-10207-learned-build-scheduled-run-2026-09
title: BUILD scheduled run 2026-09-24: all 10 W2-MERGE-* agent_dispatch ticke
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10207 (BUILD scheduled run)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD scheduled run 2026-09-24: all 10 W2-MERGE-* agent_dispatch tickets queued for BUILD were premature -- 3 PRs were already merged (nv-vault#578/#580, northside-intelligence#271), 4 are still drafts not ready to merge (nv-vault#563/#575, AXON#263/#264 -- #264 also targets a stacked non-main base), and 3 have real merge conflicts (nv-vault#548, northside-intelligence#285, AXON#259). Whatever inserts W2-MERGE-* tickets is not checking draft/merged/mergeable_state before filing -- it should only file a merge ticket once a PR is non-draft, mergeable_state=clean, and not already merged/closed. Until fixed, BUILD will keep re-checking already-resolved or not-ready tickets on every run.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10207 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
