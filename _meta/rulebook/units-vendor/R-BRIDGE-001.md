---
type: reference
id: R-BRIDGE-001
title: "No bridge tool is not proof of no Mac-mini access"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["mac mini", "bridge tool", "not accessible", "ollama", "local axon"]
source: "nvg-operator-core §4l"
lives_in:
  - "nvg-operator-core §4l"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, mac-mini]
---

Before telling JB or writing into a report that something touching the Mac mini, Ollama/local AXON, Chrome posting, or local cron "can't be done from here", invoke `mac-mini-bridge` and run its heartbeat check first. `nvg_mini_jobs` is a working async route for sessions with no live bridge tool — only a stale/missing `nvg_mini_heartbeat` row is a real negative.

See [[_meta/rulebook/INDEX|Rulebook Index]].
