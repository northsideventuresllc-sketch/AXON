---
type: reference
id: LEARN-10329-learned-build-2026-09-24-sentinel
title: BUILD 2026-09-24: SENTINEL (daily security/code-quality agent) has nev
priority: normal
scope:
  agents: ["all"]
  ventures: ["build"]
  harnesses: ["all"]
triggers: []
source: Learnings#10329 (BUILD close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD 2026-09-24: SENTINEL (daily security/code-quality agent) has never fired since being built 2026-09-14 -- last_fired_at still NULL 10 days later — why: Its NI-Brain row records an intended daily schedule, but no agent session has the ability to create the actual account-level recurring scheduled task -- that is a platform action only JB (or a session with that specific permission) can take. A row describing a schedule is not the schedule existing. — fix now in place: Logged as a Learning and handed to JB as a plain-English decision brief (create the real scheduled task); not something this session could fix itself

Why: Auto-drafted by learnings-applier-agent from Learnings row 10329 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
