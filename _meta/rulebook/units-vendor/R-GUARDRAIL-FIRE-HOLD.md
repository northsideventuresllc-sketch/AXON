---
type: reference
id: R-GUARDRAIL-FIRE-HOLD
title: "AXON FIRE/HOLD gate — defaults to HOLD, fails safe to HOLD"
priority: should
kind: guardrail
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [axon]
  harnesses: [ALL]
triggers: ["fire hold gate", "axon-fire-gate", "outreach blocked", "hold state"]
source: "AXON CLAUDE.md Safety note"
lives_in:
  - "AXON repo lib/axon-fire-gate.ts"
  - "AXON CLAUDE.md 'Safety note'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: hook:axon-fire-gate
tags: [rulebook, should, guardrail, approval]
---

The AXON repo ships a FIRE/HOLD gate (`lib/axon-fire-gate.ts`) that defaults to HOLD and fails safe to HOLD if NI-Brain is unreachable — it blocks outreach sends, dispatch fires, cron enabling, and content publish/schedule until JB flips it to FIRE. Never work around this gate to make a task look complete; an unreachable brain is a reason to hold, not to bypass.

See [[_meta/rulebook/INDEX|Rulebook Index]].
