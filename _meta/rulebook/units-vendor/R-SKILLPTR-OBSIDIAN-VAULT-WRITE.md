---
type: reference
id: R-SKILLPTR-OBSIDIAN-VAULT-WRITE
title: "Invoke obsidian-vault-write at every session close and on manual checkpoint"
priority: should
kind: skill-pointer
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["checkpoint vault", "save this", "vault write", "obsidian checkpoint"]
source: "golden skill obsidian-vault-write"
lives_in:
  - "nv-vault .claude/skills/obsidian-vault-write/SKILL.md"
  - "DB table: golden_skills (must never be removed per JB direct order 2026-08-13)"
version: 1
updated: 2026-09-24
superseded_by: 
owner: skill:obsidian-vault-write
tags: [rulebook, should, skill-pointer]
---

`obsidian-vault-write` governs how a session checkpoints work into the vault so JB's graph view stays current — at session close, on a manual "checkpoint this"/"save this" request, and via the hourly scheduled safety net. GOLDEN, always loaded — never remove it from the golden_skills registry.

See [[_meta/rulebook/INDEX|Rulebook Index]].
