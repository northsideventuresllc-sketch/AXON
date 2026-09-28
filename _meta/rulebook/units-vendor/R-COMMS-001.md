---
type: reference
id: R-COMMS-001
title: "Telegram is the one door for JB approvals"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["approval", "telegram", "needs jb approval", "jb_ask"]
source: "AGENTS.md Telegram Approval Protocol; OPERATING-RULES.md §5"
lives_in:
  - "AGENTS.md Telegram Approval Protocol; OPERATING-RULES.md §5"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, comms, approval]
---

Every approval or decision needed from JB routes to Telegram as an approval card with a plain-English `jb_ask` and clickable `jb_options` buttons — never a bare Claude Code ping, never a Slack DM to JB. State the specific decision, why it matters, and the consequence; never alert him that "something needs approval" with no actual question attached.

Example: `jb_options: ["Deploy to Staging", "Cancel"]`

See [[_meta/rulebook/INDEX|Rulebook Index]].
