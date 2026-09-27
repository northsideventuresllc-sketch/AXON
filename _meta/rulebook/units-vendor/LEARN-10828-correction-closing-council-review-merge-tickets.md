---
type: reference
id: LEARN-10828-correction-closing-council-review-merge-tickets
title: Closing council review/merge tickets by owner+PR: do NOT assume a t
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10828 (COUNCIL GATE scheduled fire)
version: 1
updated: 2026-09-27
status: draft
---

[CORRECTION] Closing council review/merge tickets by owner+PR: do NOT assume a ticket UUID from a code prefix or list position. I passed AXON #285 ticket UUID (8a999a60) while intending nv-vault #655, and fn_axon_verify_dispatch happily verified it against #285's own spec_on_file — the function validates the SPEC on the ticket, not that the caller targeted the right ticket, so a wrong-UUID close looks successful. Caught by reading spec_on_file.reason in the return value (it named AXON/pull/285). Fix: always re-fetch the exact id by code immediately before verify, and read back spec_on_file.reason to confirm it matches the intended PR. Reverted the false close on #285.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10828 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
