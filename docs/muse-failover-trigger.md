# MUSE Failover Trigger — proposal (NEEDS JB APPROVAL for the cron part)

## When MUSE wakes up (plain terms)

MUSE runs only as a backup. It wakes when any one of these is true:

1. **JB says so.** "Use Muse" (or any direct order) always wins. Nothing else is checked.
2. **The primary harness looks down.** No heartbeat in `nvg_agent_presence`
   from primary agents (BUILD / Claude Code sessions) for 30+ minutes
   AND there is open, unclaimed work in the queue.
3. **A ticket is stalled.** A ticket claimed by the primary sits with no
   progress for 45+ minutes (claimed_at old, status still open/running,
   no presence update from the claimer).

MUSE never wakes for: routine quiet (no open work = nothing to do),
or to "help" while the primary is actively working.

## How the check runs (no GitHub Actions — ever)

Two layers. Either may fire; both are polling, nothing inbound.

**Layer 1 — NI-Brain pg_cron (proposed, needs JB to create):**

```sql
-- NEEDS JB APPROVAL — DO NOT APPLY
-- 1) Verify pg_cron exists: SELECT * FROM pg_extension WHERE extname='pg_cron';
-- 2) Wake-check every 15 minutes. It does NOT do work itself; it only
--    records that failover conditions are met, which the MUSE session
--    (or a JB order) then acts on.

-- Proposed check function (draft — needs review against live schema):
-- CREATE OR REPLACE FUNCTION fn_muse_wake_check() RETURNS boolean ...
-- Logic: returns true if (a) a JB wake order row exists, or
-- (b) max(last_seen_at) for primary agents is 30+ min old AND
--     open unclaimed v_bus_inbox rows exist, or
-- (c) any agent_bus row claimed by primary, claimed_at 45+ min old,
--     status in ('open','running').
-- SELECT cron.schedule('muse-wake-check', '*/15 * * * *',
--   $$SELECT fn_muse_wake_check()$$);
```

**Layer 2 — this harness's own scheduler (MUSE-side, no approval needed):**
A 15-minute cron in the Muse platform that runs the wake check via
`scripts/muse-intake.mjs peek`. If the check says "wake," the session
claims the oldest ticket and works it. If not, it stays quiet.
This layer exists so failover does not depend on pg_cron alone.

## What "wake" does

1. Run `muse-intake.mjs claim` — oldest open, unclaimed, MUSE-or-ALL ticket.
2. If a ticket is claimed: do the work, write the close-out row,
   release or complete the ticket.
3. If the queue is empty: stay quiet. Log one line, do nothing else.

## Open question for JB

Auto-wake on the checks above, or wake only on your direct order?
(Recommend: auto-wake on, with a kill switch row you can flip any time.)
