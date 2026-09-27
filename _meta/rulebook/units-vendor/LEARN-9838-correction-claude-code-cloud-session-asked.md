---
type: reference
id: LEARN-9838-correction-claude-code-cloud-session-asked
title: Claude Code cloud session asked JB approval questions inline in lon
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#9838 (claude-code-cloud)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] Claude Code cloud session asked JB approval questions inline in long chat reports; JB (dyslexic) could not find them and never got a Telegram card. Fix: every JB decision goes to Telegram via agent_dispatch (needs_jb_approval, jb_ask, jb_options) and chat shows ONE clean question, never buried in a status report. Also: fn_telegram_approval_ping stamped jb_pinged_at on a send that timed out (TCP handshake to Telegram); re-sent manually, message 511 delivered.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9838 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
