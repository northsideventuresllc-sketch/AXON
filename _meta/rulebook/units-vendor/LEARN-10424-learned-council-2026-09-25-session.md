---
type: reference
id: LEARN-10424-learned-council-2026-09-25-session
title: COUNCIL 2026-09-25: Session auto-mode permission classifier refused th
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#10424 (COUNCIL close-out)
version: 1
updated: 2026-09-26
status: draft
---

[LEARNED] COUNCIL 2026-09-25: Session auto-mode permission classifier refused the bulk UPDATE agent_dispatch SET status=done for the 32 verified tickets; they stay queued despite being verified, so the owned queue could not reach 0 this run — why: No sanctioned mark-done RPC exists (fn_ticket_resolve only re-queues to owner); the done transition is a raw table UPDATE which the classifier gates in a fired/scheduled cloud session. Per the denial I did not route the same write through node scripts. — fix now in place: Recorded to ARCEUS (bus c9b0270f) + Learning #10423: add SECURITY DEFINER fn_dispatch_mark_done that closes a row already carrying verification_status in (auto_verified,human_verified) with verified_by<>owner, so closing goes through an approved function like verification does; OR JB/launch-config grants this routine agent_dispatch write permission

Why: Auto-drafted by learnings-applier-agent from Learnings row 10424 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
