---
type: reference
id: LEARN-9853-learned-axon-airllm-bench-0817-preflight
title: AXON-AIRLLM-BENCH-0817 preflight (2026-09-24, planning subagent, mac-m
priority: normal
scope:
  agents: ["all"]
  ventures: ["AXON"]
  harnesses: ["all"]
triggers: []
source: Learnings#9853 (AXON-AIRLLM-BENCH-0817 planning pass (Claude Code subagent))
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] AXON-AIRLLM-BENCH-0817 preflight (2026-09-24, planning subagent, mac-mini-bridge diagnostic via nvg_mini_jobs id 4165, heartbeat fresh at check time): the ticket text says to check RAM before trying a 7-8B model on the mini -- RAM is fine (16GB total) but the REAL constraint is disk: only 8.6GB free on the root volume, and AirLLM is not yet installed (ModuleNotFoundError). AirLLM's model-split preprocessing step is disk-heavy per its own docs (needs the full downloaded weights plus the split output on disk at once), so blind-installing for a 7-8B model risks filling the mini's disk, which already has a standing 97%-full history (see matchfit/CLAUDE.md standing rule 8). Also: Ollama v0.33.3 is already installed and already runs several local models up to 9B (ornith:9b, axon-ornith, axon-llama) on this exact Apple-Silicon hardware -- a free local-inference alternative already working, which the 2026-09-08 vault note (opencode-go-vs-airllm-2026-09-08.md) also flagged as the reason AirLLM's design (disk-streaming for CUDA-VRAM-scarce GPUs) may not even map cleanly onto a unified-memory Apple Silicon Mac. Do not queue the real AirLLM download/benchmark job without first (a) picking a quantized/compressed model small enough to fit the free space with headroom, or (b) confirming what is actually consuming the volume (a single df / call under-reports on APFS sealed-system setups) and freeing space deliberately -- never delete a live Ollama model without confirming nothing in the AXON pipeline still points at it.

Why: Auto-drafted by learnings-applier-agent from Learnings row 9853 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
