---
type: reference
id: LEARN-10818-learned-council-gate-2026-09-26
title: COUNCIL GATE 2026-09-26: nv-vault#662 first merge attempt returned Git
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#10818 (COUNCIL GATE close-out)
version: 1
updated: 2026-09-27
status: draft
---

[LEARNED] COUNCIL GATE 2026-09-26: nv-vault#662 first merge attempt returned GitHub 405 base-branch-modified — why: council-pr-review-record fires a sibling COUNCIL GATE per recorded pass; concurrent activity moved base main momentarily, so the SHA-pinned merge needed GitHub to recompute mergeability — fix now in place: Retried the SHA-pinned merge once after recompute; merge-pr.mjs is idempotent on already-merged state so a race cannot double-merge

Why: Auto-drafted by learnings-applier-agent from Learnings row 10818 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
