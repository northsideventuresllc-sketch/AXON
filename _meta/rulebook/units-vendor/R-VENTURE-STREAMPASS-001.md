---
type: reference
id: R-VENTURE-STREAMPASS-001
title: "Stream Pass runs on the remote NI-Brain Supabase, no local stack"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [nvg]
  harnesses: [ALL]
triggers: ["streampass", "supabase env", "tmdb"]
source: "streampass AGENTS.md"
lives_in:
  - "streampass AGENTS.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, venture]
---

Stream Pass dev uses the remote Northside Intelligence Brain Supabase project (`kxijunwgbrlfzvgkhklo`) directly — there is no local Supabase stack to stand up. Required env includes `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `TMDB_API_KEY`, `STREAMPASS_ADMIN_KEY`.

See [[_meta/rulebook/INDEX|Rulebook Index]].
