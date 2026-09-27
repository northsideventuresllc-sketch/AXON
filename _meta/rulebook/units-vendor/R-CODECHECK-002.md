---
type: reference
id: R-CODECHECK-002
title: "Every bug fix ships a named regression test"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["bug fix", "regression test", "bug becomes a test", "FRONTIER-06", "backfill test"]
source: "Decision #2043 (Ponder run 8, FRONTIER-06-BUG-BECOME-A-TEST)"
lives_in:
  - "nv-vault .claude/skills/nvg-completion-council/SKILL.md (bug-becomes-test lens)"
  - "nv-vault scripts/pulse-md-weekly-audit.mjs (lane 7, bugfixesWithoutNamedTest)"
  - "matchfit PR #440 (backfill example: scripts/check-lockfile-in-sync.mjs)"
version: 1
updated: 2026-09-27
superseded_by:
owner: COUNCIL
tags: [rulebook, should, codecheck]
---

A PR that fixes a bug is not done, mergeable, or closeable until it names a
regression test that fails before the fix and passes after it — a green build
alone never counts, since that only proves nothing *else* broke.

Example: `nvg-completion-council`'s bug-becomes-test lens rejects a bug-fix PR
with no named test; `pulse-md-weekly-audit.mjs` lane 7 is the mechanical
weekly backstop listing any merged bug-fix PR without one. `matchfit` PR #440
is the reference backfill shape.

See [[_meta/rulebook/INDEX|Rulebook Index]].
