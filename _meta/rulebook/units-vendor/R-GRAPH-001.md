---
type: reference
id: R-GRAPH-001
title: "Graph engineering is the default shape for non-trivial work"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["graph engineering", "spawn subagent", "parallel", "fan out", "orchestrate"]
source: "graph-engineering golden skill; nvg-operator-core §3A step 4"
lives_in:
  - "graph-engineering golden skill; nvg-operator-core §3A step 4"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, execution]
---

Fan out for looking (parallel investigation), single thread for deciding, verifier ≠ producer, depth ≤ 2, use Haiku/Sonnet for parallel lanes. Reserve subagent spawns for genuinely independent work — not a default orchestration habit, since each spawn carries real fixed token overhead.

See [[_meta/rulebook/INDEX|Rulebook Index]].
