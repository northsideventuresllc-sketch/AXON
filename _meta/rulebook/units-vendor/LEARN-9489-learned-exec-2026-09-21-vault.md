---
type: reference
id: LEARN-9489-learned-exec-2026-09-21-vault
title: EXEC 2026-09-21: Vault write-back flush (Mac-mini) failed twice today 
priority: normal
scope:
  agents: ["all"]
  ventures: ["exec"]
  harnesses: ["all"]
triggers: []
source: Learnings#9489 (EXEC close-out)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] EXEC 2026-09-21: Vault write-back flush (Mac-mini) failed twice today (03:18Z, 10:18Z): push rejected, refusing to reset working tree — recurring since ~09-18, so queued Decisions/Learnings/session-logs are not reliably flushing to the vault — why: Mac-mini local nv-vault clone push rejected (working tree diverged from remote); flush script correctly refuses to hard-reset a dirty tree; mini-local, not reachable from a cloud session — fix now in place: Not fixed this run (mini-local); already owned via open DISPATCH->PULSE ticket LOOP-LIVE-vault_writeback_queue-STALLED; surfaced to JB, no duplicate ticket

Why: Auto-drafted by learnings-applier-agent from Learnings row 9489 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
