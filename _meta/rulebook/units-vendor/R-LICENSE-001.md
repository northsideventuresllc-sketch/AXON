---
type: reference
id: R-LICENSE-001
title: "An open-source badge is not a commercial permission — read the raw LICENSE"
priority: should
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["open source", "license", "licence", "dify", "self-host", "third-party dependency", "adopt library", "white-label", "multi-tenant", "apache 2.0"]
source: "AX-DIFY-LICENCE-LANDMINE-0917 (preventative finding, verifier-confirmed)"
lives_in:
  - "AX-DIFY-LICENCE-LANDMINE-0917"
version: 1
updated: 2026-09-25
superseded_by:
owner: COUNCIL
tags: [rulebook, should, money, governance]
---

Before adopting any third-party project into something Northside ships or charges for, read its **raw LICENSE file**, not the GitHub badge or star count. A project can look "Apache 2.0" yet carry custom clauses banning the commercial shape you want. Ask separately — *may we use it internally?* and *may we use it to serve paying customers?* — the answers often differ. A **paid commercial licence** is JB's money call, never an agent's (R-MONEY-002).

Example: Dify reads as Apache 2.0 but is a custom licence that forbids multi-tenant operation (one workspace per paying customer) and forbids removing its branding — so the obvious subscription-product use is off-limits without a written licence, while internal use as our own backend is fine. Same trap in `openshorts` (proprietary `cloud/` dir bans SaaS/resale) and `open-seo` (MIT but requires a paid DataForSEO key behind a "free" headline).

See [[_meta/rulebook/INDEX|Rulebook Index]].
