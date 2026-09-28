---
type: reference
id: R-VENTURE-RESEND-001
title: "Two Resend accounts exist — check both before calling a domain unverified"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [match_fit, ni]
  harnesses: [ALL]
triggers: ["resend", "email domain", "two accounts", "sending failed silently"]
source: "matchfit/NI CLAUDE.md standing rule 3"
lives_in:
  - "matchfit/NI CLAUDE.md standing rule 3"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, should, venture, email]
---

`northsideintelligence.com` is verified on the NI account (`RESEND_API_KEY_NI`); `match-fit.net` is on the other (`RESEND_API_KEY`). Sending NI mail with the Match Fit key silently fails. Never conclude a domain is unverified before checking both accounts.

See [[_meta/rulebook/INDEX|Rulebook Index]].
