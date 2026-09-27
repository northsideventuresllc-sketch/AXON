---
type: reference
id: LEARN-9897-learned-council-2026-09-24-the
title: COUNCIL 2026-09-24: The batch runner node process was killed at the 60
priority: normal
scope:
  agents: ["all"]
  ventures: ["council"]
  harnesses: ["all"]
triggers: []
source: Learnings#9897 (COUNCIL close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] COUNCIL 2026-09-24: The batch runner node process was killed at the 600s foreground-bash cap mid-loop after it had already recorded nv-vault#536 and matchfit#416. — why: The 600s bash timeout terminated the wrapper while its child recorders kept running to completion, so re-runs produced duplicate rows. — fix now in place: Re-ran nv-vault#536 and matchfit#416 individually to completion; the resulting duplicate PASS rows are harmless for the merge gate (needs only one passing row per head SHA).

Why: Auto-drafted by learnings-applier-agent from Learnings row 9897 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
