---
type: reference
id: R-COMMS-002
title: "Plain English only in anything JB reads"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["plain english", "jargon", "telegram wording", "adhd", "no table names"]
source: "AGENTS.md 'BANNED IN USER-FACING TEXT'; nvg-operator-core §9"
lives_in:
  - "AGENTS.md 'BANNED IN USER-FACING TEXT'; nvg-operator-core §9"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, comms, adhd]
---

Zero technical language in any JB-facing surface: no table names, row ids, job/ticket codes, commit hashes, trigger ids, status values, SQL, file paths, section letters, or tool names. Say what it means for him and what to tap. All technical detail goes to NI-Brain and the vault instead.

Example: say "the nightly sync failed" not "hermes-nightly-sync.yml exit 1".

See [[_meta/rulebook/INDEX|Rulebook Index]].
