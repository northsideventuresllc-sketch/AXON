---
type: reference
id: LEARN-10189-learned-build-2026-09-24-scheduled
title: BUILD 2026-09-24 scheduled run: owned queue had 66 queued + 6 needs_jb
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10189 (BUILD-scheduled-2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24 scheduled run: owned queue had 66 queued + 6 needs_jb tickets (oldest from 2026-08-11), most either speculative AXON standing-report jobs or genuine JB money/infra decisions this session cannot execute (no Mac mini, no Telegram/Slack posting attempted this run). Two of the oldest open tickets (BUILD-MF-LEADFINDER-8S-TIMEOUT-0914, FIX-NIGHTLY-SYNC-DESTROYS-LOG) were already fixed on main weeks ago (matchfit PR #398 2026-09-16; nv-vault commit d99deb46 2026-08-17 + hardening e5b89845/835896d1) but never closed -- verified independently (BUILD-VERIFIER identity, fn_axon_verify_dispatch, real commit/PR evidence) and marked done this run. The ticket tracker drifting from actual repo state, on top of a growing unworked backlog, is the real finding: closing mechanism is not being run reliably even when fixes land. Did not attempt the remaining backlog this run (context budget); did not touch Slack/Telegram (no Telegram tool access this session, Slack posting to a live business channel not attempted without more certainty). [STALE-PROMPT candidate: BUILD.md tells this session to fire via ni_platform_secrets AGENT_FIRE_BUILD key / expects repo-manager sessions -- this session ran as a single flat session with GitHub MCP + Supabase MCP only, no worktree fan-out, no Slack/Telegram tool.]

Why: Auto-drafted by learnings-applier-agent from Learnings row 10189 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
