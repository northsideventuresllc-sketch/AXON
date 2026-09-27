---
type: reference
id: R-FIRE-001
title: "Fire a named agent through fire-agent.mjs, never a raw call"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["fire agent", "AGENT_FIRE", "direct fire", "trigger agent"]
source: "nvg-operator-core §7 'Direct-fire mechanism'"
lives_in:
  - "nvg-operator-core §7 'Direct-fire mechanism'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, agents]
---

Start any of the named Claude Code agents instantly via `scripts/fire-agent.mjs <NAME>`, never a raw curl POST — the script checks the target's live `nvg_agent_routines` row (active, not retired, not merged) before firing, refusing a dead agent's leftover key. Only fall back to a raw call if the script is genuinely unavailable, and manually check the routine row first even then.

See [[_meta/rulebook/INDEX|Rulebook Index]].
