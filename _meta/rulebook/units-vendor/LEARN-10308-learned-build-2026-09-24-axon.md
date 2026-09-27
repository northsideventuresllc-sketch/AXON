---
type: reference
id: LEARN-10308-learned-build-2026-09-24-axon
title: BUILD 2026-09-24: axon_cost_ledger has recorded zero cost/spend rows s
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10308 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: axon_cost_ledger has recorded zero cost/spend rows since the table was created because every insert included the database's auto-computed total column, which Postgres rejects — why: The insert code always sent that auto-computed column explicitly instead of leaving it out for the database to fill in — fix now in place: axon#252 stops sending that column in the insert

Why: Auto-drafted by learnings-applier-agent from Learnings row 10308 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
