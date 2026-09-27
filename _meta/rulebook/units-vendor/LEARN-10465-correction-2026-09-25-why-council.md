---
type: reference
id: LEARN-10465-correction-2026-09-25-why-council
title: 2026-09-25 Why COUNCIL was slow (measured via get_trigger): its rou
priority: normal
scope:
  agents: ["all"]
  ventures: ["NVG"]
  harnesses: ["all"]
triggers: []
source: Learnings#10465 (orchestrator-session-2026-09-25)
version: 1
updated: 2026-09-26
status: draft
---

[CORRECTION] 2026-09-25 Why COUNCIL was slow (measured via get_trigger): its routine schedule was "0 19 * * 0" = ONCE A WEEK (Sundays 19:00 UTC); it only ran otherwise when manually fired. Changed to every 2 hours (stored as "58 */2 * * *", next 12:58 UTC) per JB's speed-up ask. Its model is claude-opus-4-8 (the routine setting, not AXON); nvg_agent_routines.model still says a stale "claude-3-opus-latest". The AXON first-pass reviewer on the mini is the part that uses the AXON chain; its lenses were landing on local qwen2.5:0.5b (ticket AXON-REVIEWER-LENS-MODEL-FLOOR-0925). Trigger: when a review queue grows, check the routine's real cron with get_trigger before blaming model speed.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10465 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
