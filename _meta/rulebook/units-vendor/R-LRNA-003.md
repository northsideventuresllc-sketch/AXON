---
type: reference
title: "Verify before relaying another agent's blocked claim"
status: active
updated: 2026-09-24
id: R-LRNA-003
priority: must
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['agent-discipline', 'council']
source: "Learnings #992, #1371, #1422, #1425, #1552, #1633, #2266, #2352, #2361, #2362, #2363, #2395, #2396, #2587, #3419, #3420, #6661, #6948, #7147, #7269, #7339, #7384, #7394, #7400, #7411, #7535, #7737, #7741, #7796, #7797, #7824, #7837"
version: 1
---

# Verify before relaying another agent's blocked claim

Never relay another agent's "blocked / needs JB" claim without independently verifying the Ten-Method Rule was actually exhausted — JB caught this live: "YOU DIDN'T TRY THE 10 RULE." A session that inherits mid-task work must still run its own boot sequence (nvg-operator-core Step 0) before acting, even mid-handoff. Never change a live cron/schedule or apply a cadence cut before JB explicitly confirms it, even under a directive that looks pre-approved.

Source Learning ids (slice A, merged): 992,1371,1422,1425,1552,1633,2266,2352,2361,2362,2363,2395,2396,2587,3419,3420,6661,6948,7147,7269,7339,7384,7394,7400,7411,7535,7737,7741,7796,7797,7824,7837

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
