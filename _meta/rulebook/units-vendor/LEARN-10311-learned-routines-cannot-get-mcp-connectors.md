---
type: reference
id: LEARN-10311-learned-routines-cannot-get-mcp-connectors
title: Routines cannot get MCP connectors attached via create_trigger in this
priority: normal
scope:
  agents: ["all"]
  ventures: ["nvg-os"]
  harnesses: ["all"]
triggers: []
source: Learnings#10311 (claude-code-session)
version: 1
updated: 2026-09-25
status: draft
---

[LEARNED] Routines cannot get MCP connectors attached via create_trigger in this org ("connectors parameter is not available"). Workaround proven 2026-09-24: routines in env_01Cf4ir5 inherit SUPABASE_SERVICE_ROLE_KEY + GH_TOKEN env vars, so NI-Brain works via PostgREST (v_boot returned 200) and Slack via scripts/lib/slack-agent-ops.mjs (slack-post edge fn). A routine with empty sources has no repos checked out and must git clone first. SENTINEL prompt rewritten with both and fired for its first-ever run 23:24 UTC.

Why: Auto-drafted by learnings-applier-agent from Learnings row 10311 — review before promoting to status: active.

See [[_meta/rulebook/INDEX|Rulebook Index]].
