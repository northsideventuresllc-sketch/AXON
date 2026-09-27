---
type: reference
id: LEARN-10253-learned-council-2026-09-24-the
title: COUNCIL 2026-09-24: the review-record auto-filed a BUILD merge ticket 
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#10253 (COUNCIL close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] COUNCIL 2026-09-24: the review-record auto-filed a BUILD merge ticket for #529 while it was still a draft, which BUILD would have bounced as not-ready until I undrafted it — why: council-pr-review-record.mjs does not check or clear PR draft status before firing the BUILD merge handoff (same class as BUILD Learning #10207) — fix now in place: undrafted #529 via the MCP github tool so its merge ticket became actionable; BUILD then merged it

Why: Auto-drafted by learnings-applier-agent from Learnings row 10253 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
