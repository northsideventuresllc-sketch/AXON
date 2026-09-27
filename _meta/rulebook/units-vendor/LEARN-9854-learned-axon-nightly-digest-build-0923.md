---
type: reference
id: LEARN-9854-learned-axon-nightly-digest-build-0923
title: AXON-NIGHTLY-DIGEST-BUILD-0923 (ticket 5794a310-f2c4-4c96-a71a-3235448
priority: normal
scope:
  agents: ["all"]
  ventures: ["AXON"]
  harnesses: ["all"]
triggers: []
source: Learnings#9854 (claude-planning-session)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] AXON-NIGHTLY-DIGEST-BUILD-0923 (ticket 5794a310-f2c4-4c96-a71a-3235448febd2): code build already complete and merged (PR #245, main) before this planning pass started -- table axon_nightly_digest exists (day_key, entry_ref, score, summary, unique(day_key,entry_ref)), nvg_agent_routines row axon-nightly-digest is active (mac_mini, cron 45 3 * * *, owner SENSEI). Ran a manual dry run (AXON_DRY_RUN=1, day=2026-09-23) against live NI-Brain data: 328 day entries scored against 576 prior-window entries, real top-15 novelty ranking produced, nothing written -- proves the mechanism end to end. Cron has not fired yet on the Mac mini (last_fired_at still null), so the tickets 3-consecutive-nights DONE bar stays unproven and the dispatch row correctly stays queued, not done. No further code change needed this pass -- remaining gap is time-based observation of 3 real overnight runs plus a SENSEI morning-report mention.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9854 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
