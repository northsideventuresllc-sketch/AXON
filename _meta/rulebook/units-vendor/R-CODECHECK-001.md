---
type: reference
id: R-CODECHECK-001
title: "Product-code work needs the Code-Checking Agent gate before done"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["code check", "code-checking agent", "product code gate", "CODE-CHECK: PASS"]
source: "nv-vault CLAUDE.md CODE-CHECK GATE"
lives_in:
  - "nv-vault CLAUDE.md CODE-CHECK GATE"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, engineering, review]
---

Do not mark runtime product code, APIs, UI, database queries, auth, billing, jobs, scripts, workflows, migrations, or relay patches done, ready, merged, or deployed until the Code-Checking Agent Protocol passes. Docs-only vault changes that don't alter agent behavior or product code can skip it. Dispatch CODE-CHECK without asking JB; final summaries for product code must include `CODE-CHECK: PASS`.

See [[_meta/rulebook/INDEX|Rulebook Index]].
