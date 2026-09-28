---
type: reference
id: LEARN-9903-correction-jb-2026-09-24-live
title: JB 2026-09-24 live: Telegram approval cards were cut off (old fallb
priority: normal
scope:
  agents: ["all"]
  ventures: ["agentic-os"]
  harnesses: ["all"]
triggers: []
source: Learnings#9903 (claude-code audit session 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[CORRECTION] JB 2026-09-24 live: Telegram approval cards were cut off (old fallback truncates at 160 chars), had code jargon, and did not ask clear questions; button taps only showed a brief toast so JB could not tell his reply got through. Rule: every card has a question written for that exact decision, every button answers that exact question, nothing is ever truncated, and every tap or typed reply gets a permanent visible receipt on the card (or a retry message on failure). Fixes in flight: Approval Card Writer (nv-vault) + reply-receipt lane (AXON).

Why: Auto-drafted by learnings-applier-agent from Learnings row 9903 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
