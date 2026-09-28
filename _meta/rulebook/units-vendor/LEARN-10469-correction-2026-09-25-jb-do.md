---
type: reference
id: LEARN-10469-correction-2026-09-25-jb-do
title: 2026-09-25 JB: do NOT make the Sunday COUNCIL routine run every 2 h
priority: normal
scope:
  agents: ["all"]
  ventures: ["NVG"]
  harnesses: ["all"]
triggers: []
source: Learnings#10469 (orchestrator-session-2026-09-25)
version: 1
updated: 2026-09-26
status: draft
---

[CORRECTION] 2026-09-25 JB: do NOT make the Sunday COUNCIL routine run every 2 hours. The weekly Sunday COUNCIL is the BACKUP review agent and the overall weekly review chain for business decisions (00_Command_Center/Agents/COUNCIL.md). Speed comes from separate FIRE-ONLY agents: COUNCIL GATE (PR merge reviews) and COUNCIL IMPROMPTU (on-demand decisions/triage), each fanning out subagents. Orchestrator reverted the cron to 0 19 * * 0 at 12:11 UTC; ARCEUS ticket ARCEUS-SPLIT-COUNCIL-SUNDAY-GATE-IMPROMPTU-0925 builds the split. Trigger: when review is slow, fire the gate agent - never change a scheduled agent's cadence.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10469 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
