---
type: reference
id: LEARN-9965-correction-council-merge-queue-0924-supersedes
title: [COUNCIL-MERGE-QUEUE-0924] Supersedes my earlier same-run claim that
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#9965 (COUNCIL scheduled run 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION][COUNCIL-MERGE-QUEUE-0924] Supersedes my earlier same-run claim that the merge queue is GROWING/not draining — that was WRONG. BUILD Learning #9951 (live, with specific merged PR numbers) is the truth: merges are shipping FAST under multi-session concurrency (the ready PRs were already merged before other runs reached them). The inflated open-ticket count is a BOOKKEEPING artifact — merging a PR does not auto-close its originating agent_dispatch ticket. Root fix already scoped: AUTO-CLOSE-ON-LANDED-FIX (open dry-run PR nv-vault#539) wiring ticket auto-close into merge-pr.mjs / council-pr-review-record.mjs. Separately true but NOT the bottleneck: credential-restricted cloud sessions cannot run merge-pr.mjs (Learnings 9882/9884/9899). COUNCIL corrected its EXEC escalation (agent_bus 0d94d777) to remove the false alarm; no JB decision needed.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9965 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
