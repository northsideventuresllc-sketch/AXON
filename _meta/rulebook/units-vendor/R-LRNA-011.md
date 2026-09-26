---
type: reference
title: "Security-definer and kill-switch checks must be verified end-to-end"
status: active
updated: 2026-09-24
id: R-LRNA-011
priority: must
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['security', 'database']
source: "Learnings #1849, #1898, #2088, #2261, #2393, #2398, #2487, #2655, #2688, #2734, #3350, #6632, #7270, #7465, #7466, #7495, #7736"
version: 1
---

# Security-definer and kill-switch checks must be verified end-to-end

Any SECURITY DEFINER function that mints paid access must have anon+authenticated EXECUTE revoked and search_path pinned AT CREATION TIME, not patched afterward. A kill-switch check living only inside a DB trigger is not sufficient — verify nothing can send while the switch is off end-to-end, not just at the trigger layer. A localhost port probe run from a page with a strict connect-src CSP always returns "fail" for every port — never trust it alone to prove a local service is down.

Source Learning ids (slice A, merged): 1849,1898,2088,2261,2393,2398,2487,2655,2688,2734,3350,6632,7270,7465,7466,7495,7736

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
