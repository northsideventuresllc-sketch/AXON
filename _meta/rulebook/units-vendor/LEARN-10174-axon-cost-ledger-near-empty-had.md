---
type: reference
id: LEARN-10174-axon-cost-ledger-near-empty-had
title: axon_cost_ledger near-empty had TWO independent causes, not one: (1) total_token
priority: normal
scope:
  agents: ["all"]
  ventures: ["AXON"]
  harnesses: ["all"]
triggers: []
source: Learnings#10174 (orchestrator-AXON-lane-session)
version: 1
updated: 2026-09-25
status: draft
---

axon_cost_ledger near-empty had TWO independent causes, not one: (1) total_tokens is a Postgres GENERATED ALWAYS column and both AXON writers (recordUsage/recordLlmUsage in lib/axon-router-core.mjs) sent it explicitly, so PostgREST rejected the whole insert (428C9) -- AXON PR #252 fixed this. (2) axon_cost_ledger.model is NOT NULL, and the same writers' skip/unresolved/failed/chain-exhausted branches sent model:null, a second independent 23502 rejection surviving #252 -- fixed in AXON PR #264 (stacked on #252) with a 'none' placeholder. nv-vault has its OWN unfixed copy of both bugs in scripts/lib/axon-llm.mjs (companion fix: nv-vault PR #580).

Why: Auto-drafted by learnings-applier-agent from Learnings row 10174 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
