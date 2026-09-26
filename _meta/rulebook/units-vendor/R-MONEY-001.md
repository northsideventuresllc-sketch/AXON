---
type: reference
id: R-MONEY-001
title: "Free tiers first, paid only as genuine last resort"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["ai vault", "provider order", "paid api", "runpod", "free tier", "github pro"]
source: "AXON/matchfit/NI AGENTS.md standing rule 1; Decision #2001"
lives_in:
  - "AXON/matchfit/NI AGENTS.md standing rule 1; Decision #2001"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, money, ai-vault]
---

Try free routes in order before any paid API or service: local/Ollama → RunPod (skip automatically while it fails/unfunded, per Decision #2001 — never call it "free") → OpenRouter free models → Gemini free → paid Claude/Anthropic as the last-resort safety net only. Nothing routes to a paid API by default. No paid GitHub feature, ever (Decision #1690).

Why: JB has repeatedly refused to refill paid credits.

See [[_meta/rulebook/INDEX|Rulebook Index]].
