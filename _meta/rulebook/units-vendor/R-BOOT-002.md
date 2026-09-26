---
type: reference
id: R-BOOT-002
title: "Read the live rules row every session — v_boot is the one door"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["v_boot", "boot query", "live rules row"]
source: "nv-vault CLAUDE.md BOOT CONTRACT step 2"
lives_in:
  - "nv-vault CLAUDE.md BOOT CONTRACT step 2"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, boot]
---

Query `select * from v_boot;` on NI-Brain every session (or every fired routine) for the active rules row (version+hash), automation switches, open jobs, current context, and health. This is the live door; `_meta/OPERATING-RULES.md` is a mirror only, and the row wins on any disagreement.

See [[_meta/rulebook/INDEX|Rulebook Index]].
