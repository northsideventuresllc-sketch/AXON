---
type: reference
id: R-VAULT-001
title: "Every vault note carries the closed frontmatter schema"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [claude-code]
triggers: ["frontmatter", "vault schema", "note type", "zero orphan", "wikilink"]
source: "_meta/vault-system/SCHEMA.md"
lives_in:
  - "_meta/vault-system/SCHEMA.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, vault]
---

Every `.md` in a live vault folder has `type` (one of moc/decision/reference/project/sop/log/rollup/archive), `title`, `status`, `canonical`, `updated`, `superseded_by`, `owner`, `tags`. No `status: superseded` note sits outside `_archive/`; none has an empty `superseded_by`. Every new note has at least one wikilink — the zero-orphan rule.

See [[_meta/rulebook/INDEX|Rulebook Index]].
