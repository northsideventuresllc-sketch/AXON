---
type: reference
id: LEARN-10206-learned-build-2026-09-24-this
title: BUILD 2026-09-24: This session could not supply the GitHub and databas
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10206 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: This session could not supply the GitHub and database keys the merge script needs, so a ready, reviewed, safe fix (nv-vault#580) could not be merged this run — why: This session's sandbox will not allow writing or exporting the raw GitHub/database key values needed to run the merge script directly — the same limit a different agent already hit earlier today — fix now in place: Left nv-vault#580 queued for a run that can actually supply the needed keys, instead of merging it a different way that skips the normal safety check

Why: Auto-drafted by learnings-applier-agent from Learnings row 10206 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
