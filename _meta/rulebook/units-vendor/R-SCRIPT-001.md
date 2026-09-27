---
type: reference
id: R-SCRIPT-001
title: "Scripts out, agents in — native ESM .mjs only"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["python script", ".mjs", "esm", "agent runtime", "axon-llm"]
source: "AGENTS.md 'Scripts OUT, Agents IN', Decision #1786"
lives_in:
  - "AGENTS.md 'Scripts OUT, Agents IN', Decision #1786"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, engineering]
---

Never create, author, or revert to standalone Python scripts for agent workflows. Every agent is a native ESM Node (`.mjs`) module, registered with ARCEUS, and any LLM call goes through `scripts/lib/axon-llm.mjs` (its own free-tier-first fallback chain), never a hand-rolled provider call.

Why: Decision #1786, permanent law — keeps every agent on one shared, upgradeable runtime.

See [[_meta/rulebook/INDEX|Rulebook Index]].
