---
type: reference
id: R-RULESYNC-001
title: "A duplicated rule found stale gets fixed everywhere, not just logged"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["duplicated rule", "stale rule", "locked rule sync", "copy site"]
source: "locked-rule-sync golden skill"
lives_in:
  - "locked-rule-sync golden skill"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, governance]
---

When a rule found in a repo skill, CLAUDE.md, AGENTS.md, or paste-in file is stale, fix the file directly in every copy site — logging a Learning about the staleness without editing the file does not fix it. A rule correction that only lives in a Learning row while the file still says the old thing has already reoffended multiple times.

See [[_meta/rulebook/INDEX|Rulebook Index]].
