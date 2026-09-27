---
type: reference
id: LEARN-10183-learned-decisions-1962-1965-1969-axon
title: Decisions #1962/#1965/#1969 (AXON-STORAGE-AUDIT-AGENT-0921, AXON-MODEL
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10183 (agent)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] Decisions #1962/#1965/#1969 (AXON-STORAGE-AUDIT-AGENT-0921, AXON-MODEL-STORAGE-PRUNE-0921, AXON-WHOLE-DISK-REASONING-SCANNER-0921) were announced live but had zero backing code in any repo until now. Backed by scripts/mini-storage-agent.mjs in nv-vault PR #586 (https://github.com/northsideventuresllc-sketch/nv-vault/pull/586): hourly df/ollama/du measurement, nvg_run_heartbeats proof-of-run every run, 85%+ regenerable-only auto-clean (npm cache verify + logs older than 14 days), never-auto-deletes an Ollama model (only recommends, and only when unreferenced in both repo grep and recent nvg_mini_jobs relay_metric usage), 90%+ or any model-removal recommendation files one daily-deduped agent_dispatch ticket with a plain-English jb_ask. 40/40 tests pass (node --test). PR is draft, not merged; the nvg_agent_routines scheduling insert is proposed-only in scripts/sql/proposed/, not applied.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10183 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
