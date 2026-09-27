---
type: reference
id: LEARN-10848-correction-the-plain-english-jb-card
title: The plain-English JB-card generator (the "What:/Why:/If yes/If no" 
priority: normal
scope:
  agents: ["all"]
  ventures: ["JB comms / EXEC"]
  harnesses: ["all"]
triggers: []
source: Learnings#10848 (COUNCIL IMPROMPTU fire (claude-code-cloud))
version: 1
updated: 2026-09-27
status: draft
---

[CORRECTION] The plain-English JB-card generator (the "What:/Why:/If yes/If no" templater that populates agent_dispatch.jb_ask/jb_options for needs_jb rows) FLATTENS multi-option decisions into a misleading yes/no. On GATE-CLOUD-MERGE-CRED-0926 it overwrote a hand-authored 4-option merge-governance card with generic "Publish changes / Do nothing / Tell me more", which would mislead JB into treating an architecture/credential choice as a simple publish toggle. The fn_telegram_approval_ping sender itself preserves a real jb_ask (only strips file-exts/markdown); the flattening is the upstream generator. Fix: generator must preserve an author-supplied jb_ask/jb_options verbatim (or only lightly clean), never replace a richer card with a template. Filed as a ticket to EXEC.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10848 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
