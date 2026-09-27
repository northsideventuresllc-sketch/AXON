---
type: reference
id: LEARN-10356-learned-outreach-2026-09-24-broke
title: OUTREACH 2026-09-24: broke — Self-caused near-miss: while investigatin
priority: normal
scope:
  agents: ["all"]
  ventures: ["outreach"]
  harnesses: ["all"]
triggers: []
source: Learnings#10356 (OUTREACH close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] OUTREACH 2026-09-24: broke — Self-caused near-miss: while investigating, ran `git checkout origin/main -- .` against my working branch (claude/gracious-turing-uu0dc7) to inspect main's file content -- this is exactly the wide-pathspec checkout pattern that overwrites uncommitted work without warning. It reverted one already-committed file's working-tree copy (src/lib/outreach-ni-brain-learning.ts) to main's version.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10356 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
