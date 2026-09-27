---
type: reference
id: LEARN-10223-learned-build-2026-09-24-the
title: BUILD 2026-09-24: The nightly merge pipeline cannot run end-to-end fro
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10223 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: The nightly merge pipeline cannot run end-to-end from this session — why: merge-pr.mjs and council-pr-review-record.mjs need a GitHub token as a session variable and it is not set here — only the Supabase key is present — fix now in place: None applied this run — flagged as carry-forward for a session that can pull the GitHub token from the secrets table first

Why: Auto-drafted by learnings-applier-agent from Learnings row 10223 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
