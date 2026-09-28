---
type: reference
id: R-BOOT-004
title: "Check for the PROOF-OF-GATE marker before claiming mechanical hooks are live"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code]
triggers: ["proof of gate", "hooks fired", "gates off", "fired session"]
source: "Decision ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908"
lives_in:
  - "Decision ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, boot, hooks]
---

Before claiming the mechanical every-task gates (tickets-first PreToolUse, Stop gate, boot-contract print) are active this session, check for `${CLAUDE_PROJECT_DIR:-.}/.nvg/boot-contract-fired-at` dated this session. Found → gates are live. Missing → say so in one line ("gates OFF, proceeding on manual discipline") and never claim mechanical enforcement that cannot be proven.

See [[_meta/rulebook/INDEX|Rulebook Index]].
