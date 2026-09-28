---
type: reference
id: R-MEMORY-001
title: "Claude's built-in memory is disabled and never a source"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["memory", "claude memory", "remember this"]
source: "nvg-operator-core §2"
lives_in:
  - "nvg-operator-core §2"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, core, memory]
---

Never read from, quote, or suggest enabling Claude's built-in memory feature — it is disabled on this account and, even if on, would not be a source of truth. It may only ever be a scratchpad inside a single session; anything worth keeping must be written into NI-Brain and the vault before the session ends.

Why: prevents an agent from treating a disabled, non-existent memory as real state.

See [[_meta/rulebook/INDEX|Rulebook Index]].
