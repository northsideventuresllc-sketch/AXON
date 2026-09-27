---
type: reference
id: R-SECRET-001
title: "Never expose secrets; never rotate credentials without JB"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["secret", "api key", "credential", "PAT", "rotate"]
source: "AGENTS.md 'No secrets in git'; nvg-operator-core §7 Hard Stops"
lives_in:
  - "AGENTS.md 'No secrets in git'; nvg-operator-core §7 Hard Stops"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, security, hard-stop]
---

Never print, echo, log, or commit any secret, API key, PAT, or credential — in code, chat, Telegram, or a report. Never rotate or regenerate any credential on your own initiative; that is its own explicit Hard Stop even though it looks like "just an env var change".

Why: a leaked or silently-rotated credential breaks other live sessions and surfaces.

See [[_meta/rulebook/INDEX|Rulebook Index]].
