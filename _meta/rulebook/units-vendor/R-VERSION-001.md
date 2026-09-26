---
type: reference
id: R-VERSION-001
title: "Match Fit bumps product version on every production deploy"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [match_fit]
  harnesses: [ALL]
triggers: ["product version", "version bump", "match fit deploy"]
source: "matchfit AGENTS.md 'Product version'"
lives_in:
  - "matchfit AGENTS.md 'Product version'"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, venture, deploy]
---

Match Fit uses major.minor.patch with optional BETA, bumped in the same PR as the shipping change — the owner doesn't need to ask. `npm run version:bump -- patch --reason "..."`; CI enforces the bump via `version:verify` when product paths change.

See [[_meta/rulebook/INDEX|Rulebook Index]].
