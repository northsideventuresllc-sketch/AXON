---
type: reference
id: R-WORKSPACE-001
title: "Files, clones, and worktrees stay inside the Agentic OS Hub structure"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["worktree", "file routing", "agentic os hub", "temp files"]
source: "AGENTS.md Agent Storage & File-Routing Protocol; OPERATING-RULES.md §14"
lives_in:
  - "AGENTS.md Agent Storage & File-Routing Protocol; OPERATING-RULES.md §14"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, filesystem]
---

Write files only inside the six-folder split: `01_Vault/` (nv-vault strategy/docs), `02_Repos/` (canonical git repos), `03_Agents/` (daemons/runners), `04_Reports_and_Logs/`, `05_Archive/` (temp worktrees — pruned on completion). When the working repo IS nv-vault, its own root doubles as `01_Vault/` and `03_Agents/tools/` lives at the repo root.

See [[_meta/rulebook/INDEX|Rulebook Index]].
