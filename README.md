# AXON — NORTHSiDE Autonomous Systems

> **Phase 1:** 24/7 NI Services outreach — find → score → draft → **JB approve via Telegram** → send → close 4 paid clients.

**Canonical plan:** [nv-vault `Sector 5 — AXON/Phase 1 Stack.md`](https://github.com/northsideventuresllc-sketch/nv-vault/blob/main/NORTHSiDE%20Intelligence%20(NI)/Sector%205%20%E2%80%94%20AXON/Phase%201%20Stack.md)

---

## How JB accesses AXON today

| Surface | What |
|---------|------|
| **Telegram** | Drafts land in your chat nightly. Commands below. |
| **NI-Brain** | `ni_brain_outreach` where `source = axon_ni_services` |
| **GitHub Actions** | Manual run: Actions → AXON NI Outreach / AXON Telegram Poll |

**Web UI** at `/` (dashboard) and `/axon` (public waitlist). Login via `AXON_DASHBOARD_SECRET`.

---

## Telegram commands

```
/status              — pipeline summary
/approve <id>        — send approved email (Resend) or mark LinkedIn approved
/reject <id>         — kill lead
/sent_li <id>        — mark LinkedIn DM sent manually
```

`<id>` = first 8 chars of lead UUID (shown in each draft message).

---

## GitHub Actions secrets

Add in **Settings → Secrets → Actions** on this repo:

| Secret | Required | Notes |
|--------|----------|-------|
| `SUPABASE_SERVICE_KEY` | **Yes** | NI-Brain service role |
| `ANTHROPIC_API_KEY` | **Yes** | Haiku drafts |
| `GEMINI_API_KEY` | Yes | Prospect scan |
| `SERPAPI_API_KEY` | Yes | Lead discovery |
| `TELEGRAM_BOT_TOKEN` | **Yes** | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | **Yes** | Your personal chat ID |
| `RESEND_API_KEY` | For email send | After approve |
| `RESEND_FROM_EMAIL` | Optional | Default: `Jonny <northside@northsideintelligence.com>` |
| `GEMINI_API_KEY_BACKUP` | Optional | Fallback |

Keys can also live in NI-Brain `ni_platform_secrets` — env vars take precedence.

---

## Local dev (Mac)

```bash
cp .env.example .env   # fill from NI-Brain / GitHub secrets
npm install
npm run dev            # web UI at http://localhost:3000
npm run outreach:dry   # no writes
npm run outreach       # live run
npm run telegram:poll  # process Telegram commands once
```

---

## Schedule

| Workflow | Cron (UTC) | EST |
|----------|------------|-----|
| AXON NI Outreach | `30 7 * * *` | 2:30 AM (after Hermes 2 AM) |
| AXON Telegram Poll | `*/15 * * * *` | Every 15 min |

---

## Guardrails

- No auto-send outbound
- Max 15 new drafts/day
- $20/mo API cap (monitor Anthropic console)
- Hermes stays separate — sync only, no LLM

---

## Repo map

```
app/           Next.js web UI (dashboard + /axon landing)
components/    AXON UI components
lib/           shared clients (supabase, ai, telegram, resend, serpapi)
scripts/       outreach engine + telegram poll
.github/       scheduled workflows
```
