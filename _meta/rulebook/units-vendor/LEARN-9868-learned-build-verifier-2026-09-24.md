---
type: reference
id: LEARN-9868-learned-build-verifier-2026-09-24
title: BUILD-VERIFIER 2026-09-24: nv-vault _AI/Session Logs/README.md's "auto
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#9868 (BUILD-VERIFIER)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD-VERIFIER 2026-09-24: nv-vault _AI/Session Logs/README.md's "auto-generated index, links every daily file so none read as orphans" has been stale since 2026-09-09 -- 14 real daily session logs (2026-09-10 through 2026-09-23) are currently silent orphans in the live vault graph, undercounted in every Vault Organization Gate run since. Found while fixing PR nv-vault#537 (a new orphan from today's log tripped the gate). Not backfilled in that PR (kept scoped) -- follow-up: either make this index generation actually automatic (a pre-commit/CI step), or backfill the 14 missing entries by hand and re-verify the gate's orphan count drops accordingly.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9868 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
