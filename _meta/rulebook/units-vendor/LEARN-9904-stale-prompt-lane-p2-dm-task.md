---
type: reference
id: LEARN-9904-stale-prompt-lane-p2-dm-task
title: Lane P2-DM task brief (Telegram approvals-to-DM, 2026-09-24) said
priority: normal
scope:
  agents: ["all"]
  ventures: ["AXON"]
  harnesses: ["all"]
triggers: []
source: Learnings#9904 (claude-lane-p2-dm)
version: 1
updated: 2026-09-25
status: draft
---

[STALE-PROMPT] Lane P2-DM task brief (Telegram approvals-to-DM, 2026-09-24) said "Live DB function fn_telegram_approval_ping was already patched to skip the group branch." Verified FALSE by reading the live function body directly via pg_get_functiondef (project kxijunwgbrlfzvgkhklo): fn_telegram_approval_ping, fn_telegram_jb_target, and fn_axon_urgent_ping_check ALL still prefer the group+approvals-thread over the private chat, unchanged, as of 2026-09-24. Did not silently work around it: nv-vault mirror scripts/sql/fn_telegram_approval_ping.sql was synced to true live state (including an unrelated pre-existing WHERE-clause drift fix), and the actual DM-first routing fix for all three functions was written to scripts/sql/proposed/2026-09-24-approvals-to-dm.sql marked NEEDS JB APPROVAL, not applied. BUILD ticket TELEGRAM-RETIRE-APPROVALS-TOPIC-0924 depends on this SQL being reviewed and applied before its topic-deletion steps can run.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9904 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
