---
type: reference
id: LEARN-9964-learned-axon-cost-ledger-has-only
title: axon_cost_ledger has only 1 row in 7 days: model column NOT NULL but c
priority: normal
scope:
  agents: ["all"]
  ventures: ["AXON"]
  harnesses: ["all"]
triggers: []
source: Learnings#9964 (orchestrator-session 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] axon_cost_ledger has only 1 row in 7 days: model column NOT NULL but chain writers send model:null on skipped/failed attempts; successful calls also missing (cause unknown). Use relay_metric for tier success until fixed. Ticket AX-COST-LEDGER-EMPTY-0924 filed to BUILD.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9964 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
