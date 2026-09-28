---
type: reference
id: LEARN-10374-learned-build-2026-09-24-broke
title: BUILD 2026-09-24: broke — Several PRs that showed as reviewed-and-pass
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10374 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: broke — Several PRs that showed as reviewed-and-passed actually had real merge conflicts against main, so the merge itself failed for nv-vault 548, 562, 565, 577, 584 | Two AXON PRs (260, 262) had new commits pushed after their review, so the review no longer matches what is actually in the PR | One PR (nv-vault 567) said in its own description it should wait for a smaller file-size PR to land first; that smaller PR had not landed yet when I merged it

Why: Auto-drafted by learnings-applier-agent from Learnings row 10374 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
