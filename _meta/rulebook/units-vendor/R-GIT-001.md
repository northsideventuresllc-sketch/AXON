---
type: reference
id: R-GIT-001
title: "Never destructively touch git history or another branch's uncommitted work"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["git", "force push", "checkout", "reset hard", "uncommitted work"]
source: "nvg-operator-core §4m; nvg-operator-core §7 Hard Stops"
lives_in:
  - "nvg-operator-core §4m; nvg-operator-core §7 Hard Stops"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, git, hard-stop]
---

Never force-push main, rewrite pushed history, or wipe dirty WIP. Before any command that could discard uncommitted work (`checkout`/`restore`/`reset`/`clean`), run `git status` first and stash or commit what's there. To inspect a merged PR or another branch's file use `git show <ref>:<path>` or `git diff`, read-only — never `git checkout <ref> -- .` with a wide pathspec against a tree that has its own uncommitted work.

Why: a wide-pathspec checkout once nearly destroyed real uncommitted work on another branch.

See [[_meta/rulebook/INDEX|Rulebook Index]].
