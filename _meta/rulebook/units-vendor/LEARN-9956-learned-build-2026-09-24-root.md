---
type: reference
id: LEARN-9956-learned-build-2026-09-24-root
title: BUILD 2026-09-24: root causes observed — Two independent call sites (m
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#9956 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: root causes observed — Two independent call sites (merge-pr.mjs and council-pr-review-record.mjs) each just pass through whatever repo casing the caller types on the CLI, with nothing forcing them to agree, and the DB read used a case-sensitive exact match

Why: Auto-drafted by learnings-applier-agent from Learnings row 9956 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
