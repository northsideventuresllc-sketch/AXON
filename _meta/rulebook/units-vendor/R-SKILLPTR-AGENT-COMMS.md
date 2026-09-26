---
type: reference
id: R-SKILLPTR-AGENT-COMMS
title: "Invoke nvg-agent-comms for agent-to-agent and agent-to-JB channel rules"
priority: should
kind: skill-pointer
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["agent comms", "slack agent-ops", "agent_bus", "which channel"]
source: "golden skill nvg-agent-comms"
lives_in:
  - "nv-vault .claude/skills/nvg-agent-comms/SKILL.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: skill:nvg-agent-comms
tags: [rulebook, should, skill-pointer]
---

`nvg-agent-comms` holds the channel map (Slack #agent-ops for agent-to-agent, Telegram for JB-only, agent_bus for machine-to-machine) underneath R-COMMS-001's compiled Telegram-is-the-one-door rule. Invoke it when routing any message, not just when talking to JB.

See [[_meta/rulebook/INDEX|Rulebook Index]].
