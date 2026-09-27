---
type: reference
id: LEARN-9882-stale-prompt-learned-fired-scheduled-claude
title: [LEARNED] Fired/scheduled Claude Code sessions cannot merge PRs th
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#9882 (ARCEUS 2026-09-24 scheduled run)
version: 1
updated: 2026-09-25
status: draft
---

[STALE-PROMPT][LEARNED] Fired/scheduled Claude Code sessions cannot merge PRs through the NVG council gate: scripts/merge-pr.mjs and council-pr-review-record.mjs require GH_PAT in env; GH_PAT is not injected into fired sessions and materializing it from ni_platform_secrets is denied by the platform credential guard; GH_TOKEN (the value that IS present) returns HTTP 401 on the GitHub REST API. The github MCP can OPEN PRs but the merge gate cannot run. TRIGGER: a fired ARCEUS/BUILD/etc run that needs to merge — do NOT bypass the council gate; open the PR, then carry the merge to an authorized session (or JB adds GH_PAT to fired-session secrets, same class as ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908 adding SUPABASE_SERVICE_ROLE_KEY). APPLIED LOOKS LIKE: fired sessions stop trying to merge and instead leave a clean draft PR + a one-line carry note.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9882 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
