---
id: R-LRNB-001
title: Never echo a secret value into a transcript
type: reference
priority: must
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: [secret, api key, service role key, keychain, env var, credential check, find-generic-password]
source: "Learning #8438, #8569"
version: 1
updated: 2026-09-24
status: active
---
When checking whether a secret/env var exists, check presence or length only — never pipe
the raw value to a display/log command (`head`, `echo`, `print`, a transcript-visible tool
call). Two real incidents printed a live PAT and a Supabase service-role key into session
transcripts this way.
Why: a transcript is not a secret store, and printing once is enough to leak it.

Related: [[_meta/rulebook/learnings-apply/INDEX-B]]
