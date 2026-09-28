---
type: reference
id: R-GUARDRAIL-STOP-GATE
title: "Stop gate hook — blocks a turn ending on an unclosed mandatory step"
priority: should
kind: guardrail
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code]
triggers: ["stop gate", "turn end blocked", "close out enforcement"]
source: "nv-vault .claude/hooks/nvg-stop-gate; CLAUDE.md PROOF OF GATE"
lives_in:
  - "nv-vault .claude/hooks/nvg-stop-gate.*"
  - "nv-vault .claude/settings.json (hook registration)"
version: 1
updated: 2026-09-24
superseded_by: 
owner: hook:nvg-stop-gate
tags: [rulebook, should, guardrail, hooks]
---

The Stop-gate hook (`nvg-stop-gate`) mechanically blocks a session from ending its turn when a mandatory step (e.g. the close-out row, R-CLOSEOUT-001) has not fired — same silent-failure caveat as the tickets-first gate: only live when `.claude/settings.json` is at session root, verified via the same boot-contract-fired-at marker.

See [[_meta/rulebook/INDEX|Rulebook Index]].
