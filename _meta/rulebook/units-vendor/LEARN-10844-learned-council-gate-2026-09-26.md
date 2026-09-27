---
type: reference
id: LEARN-10844-learned-council-gate-2026-09-26
title: COUNCIL GATE 2026-09-26: Stale ticket W2-MERGE-axon-286 cannot reach s
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#10844 (COUNCIL GATE close-out)
version: 1
updated: 2026-09-27
status: draft
---

[LEARNED] COUNCIL GATE 2026-09-26: Stale ticket W2-MERGE-axon-286 cannot reach status=done without a verification_spec value — why: A spec-gate trigger requires verification_spec once a ticket leaves queued; stale tickets for already-merged PRs carry none — fix now in place: Recorded the verification on axon-286 anyway; it is functionally done (PR merged) and only needs a verification_spec to flip status

Why: Auto-drafted by learnings-applier-agent from Learnings row 10844 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
