---
type: reference
id: LEARN-10335-learned-build-2026-09-24-told
title: BUILD 2026-09-24: Told JB in a push notification that this session had
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10335 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: Told JB in a push notification that this session had no mechanical safety gates, when they were in fact live (settings.json + nv-vault hooks present locally, boot-contract sentinel timestamped this same session) — why: Asserted gate status from the session environment description without first checking for a local hook checkout, violating the never-assert-what-you-have-not-run rule — fix now in place: Verified hook liveness directly (ls + sentinel timestamp) before this close-out; the false claim is corrected here and gates are confirmed live for this and future sessions rooted at /home/user

Why: Auto-drafted by learnings-applier-agent from Learnings row 10335 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
