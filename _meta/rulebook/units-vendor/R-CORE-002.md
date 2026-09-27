---
type: reference
id: R-CORE-002
title: "Newest timestamp always wins"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["stale", "conflict", "which rule wins", "supersede"]
source: "nvg-operator-core §STALENESS RULE; SCHEMA.md 'Newest wins'"
lives_in:
  - "nvg-operator-core §STALENESS RULE; SCHEMA.md 'Newest wins'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, core, staleness]
---

Every file, prompt, skill and note is a frozen snapshot that cannot update itself. When two sources disagree, the one with the newer `updated` date or Decision id wins; never repeat a stored claim about current state without re-verifying it live. Against a vault file, the live NI-Brain row always wins.

Example: a CLAUDE.md line from last month loses to today's `v_boot` row.

See [[_meta/rulebook/INDEX|Rulebook Index]].
