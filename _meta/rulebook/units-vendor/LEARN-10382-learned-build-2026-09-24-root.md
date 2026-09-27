---
type: reference
id: LEARN-10382-learned-build-2026-09-24-root
title: BUILD 2026-09-24: root causes observed — The scheduled trigger for BUI
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10382 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: root causes observed — The scheduled trigger for BUILD fired multiple overlapping sessions with no lock stopping them from grabbing the same queue at once (ticket BUILD-SESSION-AWARE-BUS-CLAIM-LOCK-0914, still open) | Council's PASS verdict does not re-check live mergeable state right before recording, so a PR can drift into conflict after being approved (ticket BUILD-MERGE-PR-LATEST-VERDICT-GATE-0924, already filed by another session this run)

Why: Auto-drafted by learnings-applier-agent from Learnings row 10382 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
