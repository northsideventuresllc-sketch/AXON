# AXON repo — agent protocol

Load nv-vault context first: `_Command Center/CONTEXT-MAP.md` + `Sector 5 — AXON/Phase 1 Stack.md`.

- **Brain:** NI-Brain `kxijunwgbrlfzvgkhklo` · table `ni_brain_outreach` · `source=axon_ni_services`
- **No secrets in git** — GitHub Actions secrets or `ni_platform_secrets`
- **No auto-send** — Telegram approve required
- **Brand:** `NORTHSiDE` exact casing · operator **JB**


## Slack posting rule (added 2026-08-19, JB direct order)

Every agent posts status/updates to Slack through ONE method only — never your own personal/native Slack connection:

```
POST https://kxijunwgbrlfzvgkhklo.supabase.co/functions/v1/slack-post
Header: Authorization: Bearer sb_publishable_-JPXXSn9eyX9BxdvIzTulw_QkHPIERR
Content-Type: application/json
Body: {"channel":"C0BR6ATGHGR","text":"<your message>"}
```

C0BR6ATGHGR is the only #agent-ops channel JB watches. Do not post to any other channel ID, and do not use a native/per-session Slack app connection for agent status posts.

