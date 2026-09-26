---
type: reference
id: R-CORE-004
title: "Never assert what you have not run this session"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["assert", "unverified", "freshness", "restamp"]
source: "nvg-operator-core §4b/§4j"
lives_in:
  - "nvg-operator-core §4b/§4j"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, core, proof]
---

A search miss is not evidence of absence. A remembered limitation is not a current one. If a fact has not been checked this session, either check it or say plainly it has not been checked. A status claim carries a freshness window — re-verify live, never restamp an old row as current.

Example: "last confirmed 2026-08-25, not reverified this run" beats a bare restamp.

See [[_meta/rulebook/INDEX|Rulebook Index]].
