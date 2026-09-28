---
type: reference
id: LEARN-10406-learned-confirmed-live-evidence-for-lrnb
title: Confirmed live evidence for LRNB-T05-COUNCIL-REAPER-BUGS-0924 (reaper 
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault / AXON / northside-intelligence"]
  harnesses: ["all"]
triggers: []
source: Learnings#10406 (BUILD scheduled run 2026-09-25)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] Confirmed live evidence for LRNB-T05-COUNCIL-REAPER-BUGS-0924 (reaper false-requeue): 3 W2-MERGE-* agent_dispatch tickets (nv-vault#548, nv-vault#584, AXON#262) sat status=queued while their PRs were already merged to main hours earlier (verified via live GitHub API pull_request_read against each). Also found a second, distinct failure mode: nv-vault#562's W2-MERGE ticket carried a passing nvg_pr_council_reviews row for a STALE head SHA (af5085f5...) after the PR was pushed again to a new head (2c84a552...) -- the review row never got invalidated by the new push, so the ticket looked merge-ready when it was not. Fixed this run: the 3 already-merged tickets were verified (BUILD-VERIFIER identity, auto_verified, GitHub API evidence) and closed done; a fresh W2-REVIEW ticket was filed for #562's current head; the remaining held tickets (#565 real conflict, #260 draft+conflict+unmerged dependency) were updated with the precise real blocker instead of being left as misleading queued merge tickets.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10406 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
