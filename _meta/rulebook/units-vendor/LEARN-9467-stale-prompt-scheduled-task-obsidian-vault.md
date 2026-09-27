---
type: reference
id: LEARN-9467-stale-prompt-scheduled-task-obsidian-vault
title: scheduled task obsidian-vault-sync (~/.claude/scheduled-tasks/obs
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#9467 (obsidian-vault-sync scheduled run)
version: 1
updated: 2026-09-25
status: draft
---

[STALE-PROMPT] scheduled task obsidian-vault-sync (~/.claude/scheduled-tasks/obsidian-vault-sync/SKILL.md): (1) says vault has no git and to clone to /tmp — vault path is now a symlink to the Hub 01_Vault git checkout of nv-vault itself, and its git status hangs (lock contention); (2) refers to _Command Center/Master Priority List.md, _meta/ and CONTEXT-MAP as stale/missing — repo now has CONTEXT-MAP.md and _meta/ live; (3) its recipe uses GNU timeout (absent on macOS, silently produced an empty vault list); (4) find prunes must exclude .claude at any depth or .claude/skills shows as false git-only; (5) plaintext GitHub PAT is embedded in the task file — keychain ni-vault-pat works and should replace it; (6) watermark row last written by this agent 2026-08-25, later ones come from the GitHub webhook. Fix the task file, do not re-log.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9467 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
