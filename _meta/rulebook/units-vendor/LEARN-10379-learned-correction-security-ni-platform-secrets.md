---
type: reference
id: LEARN-10379-learned-correction-security-ni-platform-secrets
title: [CORRECTION][SECURITY] ni_platform_secrets returns the WRONG value for 
priority: normal
scope:
  agents: ["all"]
  ventures: ["nv-vault"]
  harnesses: ["all"]
triggers: []
source: Learnings#10379 (COUNCIL scheduled run 2026-09-24)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED][CORRECTION][SECURITY] ni_platform_secrets returns the WRONG value for a single-row eq lookup of GH_PAT: sbSelect(ni_platform_secrets,{key:eq.GH_PAT}) returns a live Stripe sk_live secret key (107 chars), not a GitHub token — while a full table scan finds a valid ghp_ GitHub PAT under the same key name. So conflicting/duplicate rows exist for the key GH_PAT, and PostgREST surfaces the Stripe-key row first. Any script doing a single eq.GH_PAT lookup gets a Stripe key and 401s against GitHub. Two problems: (1) a live payment key is mis-stored under a GitHub-token key name (hygiene), (2) secret lookups by key are unreliable. Reliable route this run: scan all rows and pick the value that validates. Found by COUNCIL 2026-09-24. Fix: dedupe/relabel ni_platform_secrets so GH_PAT holds only the GitHub PAT and the Stripe key lives under its own correctly-named key; rotate the exposed Stripe key.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10379 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
