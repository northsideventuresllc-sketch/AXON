---
type: reference
id: LEARN-9860-stale-prompt-build-ticket-db55d0a1-named
title: BUILD ticket db55d0a1 named "matchfit.app" as the property to aud
priority: normal
scope:
  agents: ["all"]
  ventures: ["Match Fit"]
  harnesses: ["all"]
triggers: []
source: Learnings#9860 (claude-code-subagent / ticket db55d0a1)
version: 1
updated: 2026-09-25
status: draft
---

[STALE-PROMPT] BUILD ticket db55d0a1 named "matchfit.app" as the property to audit. Verified live: matchfit.app is NOT an NVG-owned domain -- app-store/web search for that name returns unrelated third-party apps (a soccer fitness app, a college-recruiting app, "MatchFit Me", getmatch-fit.com). NVG's Match Fit lives only at match-fit.net (confirmed against matchfit repo CLAUDE.md). Any future prompt/audit/outreach that says "matchfit.app" is targeting the wrong property -- correct to match-fit.net, do not silently work around it.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9860 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
