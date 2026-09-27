---
type: reference
id: R-MACMINI-001
title: "The Mac mini is the only machine — MacBook Pro is off-limits"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["macbook pro", "mac mini only", "wrong machine"]
source: "AXON CLAUDE.md 'Mac mini only'; v_boot machine block"
lives_in:
  - "AXON CLAUDE.md 'Mac mini only'; v_boot machine block"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, infra]
---

Obsidian, Hermes, and Ollama are not installed on the MacBook Pro; every local operation (vault, crons, dispatch execution, local models, Chrome posting) happens on the Mac mini. Finding the MacBook Pro reachable is a hard stop, not permission to route around it.

See [[_meta/rulebook/INDEX|Rulebook Index]].
