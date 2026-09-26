---
type: reference
id: R-GUARDRAIL-TICKETS-FIRST
title: "Tickets-first PreToolUse gate — mechanical, Claude Code only, when it fires"
priority: should
kind: guardrail
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code]
triggers: ["tickets first", "pretooluse gate", "hook enforcement"]
source: "nv-vault .claude/hooks/nvg-tickets-first-gate; CLAUDE.md PROOF OF GATE"
lives_in:
  - "nv-vault .claude/hooks/nvg-tickets-first-gate.* "
  - "nv-vault .claude/settings.json (hook registration)"
  - "referenced in every repo CLAUDE.md 'PROOF OF GATE' section"
version: 1
updated: 2026-09-24
superseded_by: 
owner: hook:nvg-tickets-first-gate
tags: [rulebook, should, guardrail, hooks]
---

When `.claude/settings.json` is at the session root, a PreToolUse hook (`nvg-tickets-first-gate`) mechanically requires a real ticket/dispatch context before certain tool actions proceed — this is enforcement, not a written reminder, and cannot be talked around when it's live. Its liveness is exactly what R-BOOT-004's proof-of-gate check verifies; a session that can't prove the gate fired must not claim it's enforced.

See [[_meta/rulebook/INDEX|Rulebook Index]].
