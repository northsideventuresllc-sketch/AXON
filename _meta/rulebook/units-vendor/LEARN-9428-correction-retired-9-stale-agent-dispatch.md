---
type: reference
id: LEARN-9428-correction-retired-9-stale-agent-dispatch
title: Retired 9 stale agent_dispatch needs_jb rows from July/August/early
priority: normal
scope:
  agents: ["all"]
  ventures: ["axon"]
  harnesses: ["all"]
triggers: []
source: Learnings#9428 (Antigravity session 822a7bf9-45f1-40ba-9b7c-139302279a9f)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] Retired 9 stale agent_dispatch needs_jb rows from July/August/early September that were polluting nightly Telegram wraps with raw technical jargon. Hardened jb-daily-wrap.mjs with a 72-hour window and enhanced plainTitle to sanitize machine noise and truncate multi-paragraph ticket bodies into concise summaries.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9428 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
