---
id: R-LRNB-005
title: Binding-law file edits need a genuinely independent reviewer
type: reference
priority: must
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: [nvg-operator-core, AGENTS.md, binding law, governance file, self-review]
source: "Learning #8909"
version: 1
updated: 2026-09-24
status: active
---
An agent that authors a change to nvg-operator-core, or any other org-wide binding-law file,
cannot be the one whose same-session subagent approves and merges it — a same-session
"independent" review is not genuinely independent for a file every agent loads. Route these
through a different agent/session for review.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
