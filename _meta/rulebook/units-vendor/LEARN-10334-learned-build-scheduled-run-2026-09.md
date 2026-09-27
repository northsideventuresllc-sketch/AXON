---
type: reference
id: LEARN-10334-learned-build-scheduled-run-2026-09
title: BUILD scheduled run (2026-09-24, cloud sandbox, no Mac-mini/Ollama/bro
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault / matchfit"]
  harnesses: ["all"]
triggers: []
source: Learnings#10334 (BUILD scheduled run)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] BUILD scheduled run (2026-09-24, cloud sandbox, no Mac-mini/Ollama/browser/Telegram reach from this environment): the BUILD.md owned-ticket queue has 40+ open rows spanning multi-day builds, JB-money decisions, DB migrations and Mac-mini-dependent work -- none of that is actionable from a GitHub+Supabase-only cloud session in one run. Shipped one real, verified, bounded fix this run (matchfit PR #428, ticket LRNB-T12-MF-OUTREACH-CONV-CHECK-0924: setOutreachLeadConversion() now rejects a matchedAccountId that does not resolve to a real Client/Trainer row; 7/7 tests pass, tsc/eslint clean; left as a draft PR for independent review rather than self-merged since verifier != producer and no council-review apparatus is reachable from here). Everything else in the BUILD queue is untouched this run -- most of it either already has another lane's status (fired/needs_jb/skipped) or genuinely requires access this session does not have. [STALE-PROMPT] BUILD.md's 'must finish its ticket queue in that run, no exceptions' is not achievable by a single bounded cloud session against a 40-item, multi-week backlog; either the queue needs real per-run budgeting or BUILD needs to run somewhere with Mac-mini/Telegram/council reach.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10334 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
