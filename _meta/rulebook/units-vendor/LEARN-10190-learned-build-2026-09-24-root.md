---
type: reference
id: LEARN-10190-learned-build-2026-09-24-root
title: BUILD 2026-09-24: root causes observed — repo-sync-agent.mjs commit() 
priority: normal
scope:
  agents: ["all"]
  ventures: ["repeating"]
  harnesses: ["all"]
triggers: []
source: Learnings#10190 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: root causes observed — repo-sync-agent.mjs commit() had no explicit git identity, so an automated commit on the mini can silently depend on whichever HOME/git-config context the cron/launchd process happens to run under | the same code path had no guard for the race between gatherRepoState() detecting uncommitted work and the actual add/commit a few lines later, so a change that resolved itself in between produced an empty-index commit failure

Why: Auto-drafted by learnings-applier-agent from Learnings row 10190 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
