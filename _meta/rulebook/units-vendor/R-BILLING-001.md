---
type: reference
id: R-BILLING-001
title: "Stripe/billing setup tasks run the setup scripts, not just document keys"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [match_fit]
  harnesses: [ALL]
triggers: ["stripe setup", "billing env", "vercel env push"]
source: "matchfit CLAUDE.md BILLING SETUP DEFAULT"
lives_in:
  - "matchfit CLAUDE.md BILLING SETUP DEFAULT"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, venture, billing]
---

Tasks touching Stripe billing, client VIP, or trainer payment env run the actual setup scripts (`npm run stripe:setup:*`) and push env to Vercel — not just note where keys live. Completion checklist: Stripe product/price ensured, price ID on Vercel prod+preview, `verify-stripe-env.mjs` passes, owner told the live `price_…` id (never secret values).

See [[_meta/rulebook/INDEX|Rulebook Index]].
