---
type: reference
id: R-AUTHORITY-002
title: "Hard stops — never autonomous, no active row overrides these"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["hard stop", "force push", "migration", "secret", "credential", "prod env"]
source: "nvg-operator-core §7 'Hard Stops'"
lives_in:
  - "nvg-operator-core §7 'Hard Stops'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, authority, hard-stop]
---

Never, regardless of authority: force-push main, rewrite pushed git history, wipe dirty WIP, apply DB migrations/DDL directly, run financial transactions, delete a DB table/column/index, modify prod env vars, email/notify real users, touch Stripe/payment config, delete/archive a Supabase project, rotate/regenerate a credential, or make an external-facing API change — without JB. Rewriting auth/session, payment, DB-client, or webhook code needs explicit self-certification against the 50%-user-risk test first.

Why: these are the categories that have actually caused live incidents.

See [[_meta/rulebook/INDEX|Rulebook Index]].
