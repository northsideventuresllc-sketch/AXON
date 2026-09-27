---
type: reference
id: R-CONFLICT-REPO-AUTHORITY-001
title: "Conflict: repo-level 'standing approval to merge' language predates the live authority table"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ni, match_fit]
  harnesses: [ALL]
triggers: ["standing approval", "merge authority", "conflict"]
source: "northside-intelligence AGENTS.md 'Deploy workflow'; matchfit AGENTS.md; vs nvg_agent_authority table"
lives_in:
  - "northside-intelligence AGENTS.md 'Deploy workflow'; matchfit AGENTS.md; vs nvg_agent_authority table"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, conflict, authority]
---

Several repo AGENTS.md files (northside-intelligence, matchfit) still carry hand-written prose granting "standing approval to merge PRs and deploy without asking" as a blanket repo-level rule, written before `nvg_agent_authority` existed as the live per-agent gate. R-AUTHORITY-001 in this rulebook is the current binding shape (read the table, per-agent, live, every run) — the older blanket prose is not necessarily wrong today but is not the enforced mechanism.
**conflict:** Repo-level 'standing approval' prose in northside-intelligence/matchfit AGENTS.md was never explicitly reconciled with the nvg_agent_authority table becoming the enforced gate (Decision #947/#1230/#1587 series). COUNCIL: decide whether to delete the blanket repo-level language now that R-AUTHORITY-001 is the compiled must-rule, or keep it as a documented default for agents with no table row.


See [[_meta/rulebook/INDEX|Rulebook Index]].
