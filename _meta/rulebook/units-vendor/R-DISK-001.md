---
type: reference
id: R-DISK-001
title: "Check disk before any large Mac mini install"
priority: nice
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["disk full", "mac mini install", "ollama models", "qwen"]
source: "matchfit/NI/AXON CLAUDE.md standing rule 8"
lives_in:
  - "matchfit/NI/AXON CLAUDE.md standing rule 8"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, nice, venture, infra]
---

The Mac mini has run at 97% full before, usually from Ollama models. Verify nothing references a model before removing it, and note `Qwen/Qwen2.5-7B-Instruct` in AXON's config.yaml is a HuggingFace training base, not the Ollama `qwen2.5:7b` — don't confuse the two when freeing space.

See [[_meta/rulebook/INDEX|Rulebook Index]].
