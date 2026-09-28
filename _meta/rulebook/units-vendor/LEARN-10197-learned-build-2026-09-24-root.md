---
type: reference
id: LEARN-10197-learned-build-2026-09-24-root
title: BUILD 2026-09-24: root causes observed — Ticket tracker state has drif
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10197 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: root causes observed — Ticket tracker state has drifted from actual repo state: fixes land but the owning ticket is never closed, so the queue looks bigger and staler than the real remaining work | This session ran as a single flat session (GitHub + Supabase tools only), not the worktree-fan-out repo-manager shape BUILD.md assumes, so it could not touch the 64 remaining tickets in one pass, could not post to Slack or Telegram, and could not do Mac-mini-bound work

Why: Auto-drafted by learnings-applier-agent from Learnings row 10197 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
