---
type: reference
id: R-SKILL-BOOT-001
title: "nvg-operator-core is binding law; ni-operator-core is dead, no fallback"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["boot skill", "nvg-operator-core", "ni-operator-core", "skill fails to load"]
source: "nv-vault CLAUDE.md BOOT CONTRACT; JB confirmed 2026-08-03"
lives_in:
  - "nv-vault CLAUDE.md BOOT CONTRACT; JB confirmed 2026-08-03"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, core, boot]
---

Invoke skill `nvg-operator-core` at the start of every session as BINDING LAW, not reference material — reading it is not compliance. `nvg-operator-core` is the ONLY installed skill; `ni-operator-core` no longer exists and is never invoked as a fallback. If `nvg-operator-core` fails to resolve, that is a hard stop: say so in one line and assert nothing about what is built, live, broken, or blocked.

Why: JB renamed the skill himself and confirmed there is nothing left to fall back to.

See [[_meta/rulebook/INDEX|Rulebook Index]].
