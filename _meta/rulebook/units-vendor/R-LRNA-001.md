---
type: reference
title: "Route around known cloud-sandbox infra blockers"
status: active
updated: 2026-09-24
id: R-LRNA-001
priority: should
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ['infra', 'tooling', 'workflow']
source: "Learnings #72, #1735, #1781, #1791, #1798, #1823, #1871, #1896, #2099, #2104, #2210, #2230, #2231, #2468, #2520, #2583, #2667, #2685, #2686, #2710, #2742, #2743, #2749, #2771, #2806, #2834, #2862, #2863, #2864, #3080, #3081, #3082, #3122, #3126, #3246, #3250, #3304, #3305, #3309, #3316, #3338, #3342, #3354, #3399, #3400, #3435, #3446, #3450, #3452, #3591, #3629, #3673, #3731, #5191, #5192, #5329, #5330, #5968, #6038, #6192, #6685, #6939, #6949, #7035, #7061, #7131, #7149, #7155, #7166, #7343, #7395, #7396, #7398, #7407, #7427, #7432, #7634, #7638, #7813"
version: 1
---

# Route around known cloud-sandbox infra blockers

GitHub REST API and GitHub Actions endpoints return 403 from the cloud sandbox proxy even with a valid PAT — git clone/push over HTTPS and the GitHub REST API via node fetch (not curl) still work. api.supabase.com blocks python-urllib's user-agent (403) — curl or node fetch work. Desktop Commander reaches the MacBook Pro, not the Mac mini; the mini is reached via claude-in-chrome "Browser 2" (deviceId aec955c1-a6bc-440c-9d5e-d19299b86b71). mini-relay-push.mjs only ever pushes to main.

Example: Verify device/route identity (hostname, Ollama check) before assuming a bridge reaches its target, instead of re-trying a blocked route.

Source Learning ids (slice A, merged): 72,1735,1781,1791,1798,1823,1871,1896,2099,2104,2210,2230,2231,2468,2520,2583,2667,2685,2686,2710,2742,2743,2749,2771,2806,2834,2862,2863,2864,3080,3081,3082,3122,3126,3246,3250,3304,3305,3309,3316,3338,3342,3354,3399,3400,3435,3446,3450,3452,3591,3629,3673,3731,5191,5192,5329,5330,5968,6038,6192,6685,6939,6949,7035,7061,7131,7149,7155,7166,7343,7395,7396,7398,7407,7427,7432,7634,7638,7813

Part of the [[_meta/rulebook/learnings-apply/A|Slice A hub]] in the [[_meta/rulebook/INDEX|Rulebook Index]].
