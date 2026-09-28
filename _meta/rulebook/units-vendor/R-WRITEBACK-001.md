---
type: reference
id: R-WRITEBACK-001
title: "Write back immediately, search first, supersede don't stack"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["write back", "decision", "learning", "correction", "supersede row"]
source: "AGENTS.md Write-back; nvg-operator-core §5"
lives_in:
  - "AGENTS.md Write-back; nvg-operator-core §5"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, writeback]
---

The moment a decision, learning, or correction happens, write one tagged line (`[DECISION]/[LEARNED]/[PROJECT]/[CORRECTION]`) to both NI-Brain and the vault session log — never batched to session end. Search before writing so nothing is duplicated. When a new row corrects an older one, set the old row `status='superseded'` with `superseded_by` pointing at the new one; never leave two live rows disagreeing.

Why: a full session's write-back skipping to the end has already caused lost context once.

See [[_meta/rulebook/INDEX|Rulebook Index]].
