---
type: reference
id: R-COUNCIL-001
title: "Completion council reviews every task before it's reported done"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["completion council", "review gate", "council reject", "done verdict"]
source: "nvg-completion-council golden skill"
lives_in:
  - "nvg-completion-council golden skill"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, review]
---

Dispatch `nvg-completion-council` at the end of every task that involved a tool call or produced a deliverable — not pure zero-tool conversational replies. Reject sends the work back to the same agent to redo, up to 5 rounds, before escalating. "Done" is not reported to the requester until council approves.

See [[_meta/rulebook/INDEX|Rulebook Index]].
