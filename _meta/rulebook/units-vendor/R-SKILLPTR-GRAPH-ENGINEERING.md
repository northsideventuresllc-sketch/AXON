---
type: reference
id: R-SKILLPTR-GRAPH-ENGINEERING
title: "Invoke graph-engineering for topology/roster on any multi-step task"
priority: should
kind: skill-pointer
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["graph engineering", "spawn", "delegate", "orchestrate"]
source: "golden skill graph-engineering"
lives_in:
  - "nv-vault .claude/skills/graph-engineering/SKILL.md"
  - "nv-vault Workflows & SOPs/Graph Engineering — NVG Agent Topology.md"
  - "pointer skill nvg-graph-engineering"
version: 1
updated: 2026-09-24
superseded_by: 
owner: skill:graph-engineering
tags: [rulebook, should, skill-pointer]
---

`graph-engineering` holds the full topology, roster, and failure modes behind R-GRAPH-001's compiled summary (fan out for looking, single thread for deciding, verifier ≠ producer, depth ≤ 2). Trigger on: spawn, subagent, parallel, delegate, fan out, orchestrate, or any plan with more than three steps.

See [[_meta/rulebook/INDEX|Rulebook Index]].
