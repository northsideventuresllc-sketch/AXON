---
type: reference
id: R-CURSOR-RETIRED-001
title: "Cursor is retired — treat .cursor/ artifacts as archived, not live"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["cursor retired", ".cursor directory", "cursorrules"]
source: "Decision #238; multiple repo CLAUDE.md files"
lives_in:
  - "Decision #238; multiple repo CLAUDE.md files"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, governance]
---

Cursor is retired (Decision #238). `.cursor/skills/` and `.cursor/rules/` content across repos has been ported into CLAUDE.md/AGENTS.md or archived under `_archive/cursor-retired-*`; treat any live `.cursor/` file found as a historical artifact to fold in and archive, not a current rule source.

See [[_meta/rulebook/INDEX|Rulebook Index]].
