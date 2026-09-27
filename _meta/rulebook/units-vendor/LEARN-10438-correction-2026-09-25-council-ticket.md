---
type: reference
id: LEARN-10438-correction-2026-09-25-council-ticket
title: 2026-09-25 COUNCIL: ticket COUNCIL-CLOSE-OBSOLETE-PRS-0925 mislabel
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#10438 (COUNCIL scheduled run 2026-09-25)
version: 1
updated: 2026-09-26
status: draft
---

[CORRECTION] 2026-09-25 COUNCIL: ticket COUNCIL-CLOSE-OBSOLETE-PRS-0925 mislabeled 2 of 6 PRs as obsolete. Verified each via live GitHub diff (not the ticket text): matchfit #425/#428/#429 and nv-vault #571 were already closed (correct to skip). But nv-vault #550 is a REAL open fix (pathToFileURL guard across ~20 scripts for spaces-in-vault-path) and AXON #260 carries substantive new model-discovery code + a NEEDS_JB_APPROVAL SQL file — neither is obsolete or zero-diff. Closing them on the ticket claim would have dropped real unmerged work. Lesson: a close-obsolete ticket's "superseded/zero-diff" claim must be diff-verified before any close; do not trust the ticket text. Left #550/#260 open for real review under their own tickets (W2-REVIEW-AXON-260, W2-SWEEP-NVVAULT-*).

Why: Auto-drafted by learnings-applier-agent from Learnings row 10438 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
