---
type: reference
id: LEARN-9876-stale-prompt-scheduled-task-obsidian-vault
title: Scheduled task obsidian-vault-sync (~/.claude/scheduled-tasks/obs
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg"]
  harnesses: ["all"]
triggers: []
source: Learnings#9876 (obsidian-vault-sync nightly run 2026-09-23)
version: 1
updated: 2026-09-25
status: draft
---

[STALE-PROMPT] Scheduled task obsidian-vault-sync (~/.claude/scheduled-tasks/obsidian-vault-sync/SKILL.md, dated 2026-08-20): still references _Command Center/Master Priority List.md (absent), lists _meta/ as stale (it is current per repo CLAUDE.md), embeds a plaintext GitHub PAT, and assumes the vault is a plain iCloud folder. The vault path is now a symlink to the nv-vault git checkout (Agentic OS Hub/01_Vault), local main was 5 days behind origin on 2026-09-23, and 02_Repos/ is gitignored so vault-only lists must exclude it. Also macOS has no `timeout` command. Fix the task file: use keychain ni-vault-pat, exclude 02_Repos, fast-forward the checkout instead of additive-only pull.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9876 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
