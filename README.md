# AXON — NORTHSiDE Autonomous Systems

> **Phase 1:** 24/7 NI Services outreach — find → score → draft → **JB approve via Telegram** → send → close 4 paid clients.

**Canonical plan:** [nv-vault `Sector 5 — AXON/Phase 1 Stack.md`](https://github.com/northsideventuresllc-sketch/nv-vault/blob/main/NORTHSiDE%20Intelligence%20(NI)/Sector%205%20%E2%80%94%20AXON/Phase%201%20Stack.md)

---

## How JB accesses AXON today

| Surface | What |
|---------|------|
| **Web UI (portal)** | Sign in at `northsideintelligence.com` → **AXON** in nav → `/axon-{username}/dashboard` (master account). Public waitlist at `/axon`. |
| **Web UI (standalone)** | `workspace-git-main-northsideventuresllc-sketchs-projects.vercel.app/axon` — password login via `AXON_DASHBOARD_SECRET` |
| **Telegram** | Chat with AXON like a normal AI assistant. Slash commands for pipeline actions. Drafts land nightly. |
| **NI-Brain** | `ni_brain_outreach` where `source = axon_ni_services` |
| **GitHub Actions** | Manual run: Actions → AXON NI Outreach / AXON Telegram Poll / AXON Telegram Setup |

Set `NEXT_PUBLIC_BASE_PATH=/axon` on the standalone Vercel **workspace** project.

**Portal sync:** After UI changes in this repo, run `node scripts/sync-portal-ui.mjs ../northside-intelligence` and merge in the NI portal repo so `/axon-{username}/dashboard` stays current.

---

## Telegram — chat + slash commands

**Talk normally:** Just message AXON in Telegram. It replies in plain human language — no jargon unless you ask for technical detail.

**Built-in slash commands** (visible when you type `/` in Telegram):

```
/start, /help       — intro and how to use AXON
/status             — pipeline summary in plain English
/approve <id>       — send approved email (Resend) or mark LinkedIn approved
/reject <id>        — pass on a lead
/sent_li <id>       — you sent the LinkedIn DM manually
/new                — fresh conversation note
```

`<id>` = first 8 chars of lead UUID (shown in each draft message).

**First-time setup** — register slash commands with BotFather API:

```bash
npm run telegram:setup
# Or: GitHub Actions → AXON Telegram Setup → mode: commands
```

**Real-time chat (recommended)** — Vercel webhook (instant `/status` replies):

```bash
npm run telegram:setup -- --auto
# Or: GitHub Actions → AXON Telegram Setup → mode: webhook (or auto)
```

Webhook URL (production): `https://workspace-git-main-northsideventuresllc-sketchs-projects.vercel.app/api/telegram-webhook`

Do **not** use `northsideintelligence.com/axon/api/...` until NI proxy + middleware are aligned — the root Vercel `/api/telegram-webhook` route is the working endpoint today.

Without webhook, GitHub Actions polls as fallback (best-effort ~hourly on free tier — not every 2 min).

---

## GitHub Actions secrets

Add in **Settings → Secrets → Actions** on this repo:

| Secret | Required | Notes |
|--------|----------|-------|
| `SUPABASE_SERVICE_KEY` | **Yes** | NI-Brain service role |
| `ANTHROPIC_API_KEY` | **Yes** | Haiku drafts + chat |
| `GEMINI_API_KEY` | Yes | Prospect scan |
| `SERPAPI_API_KEY` | Yes | Lead discovery |
| `TELEGRAM_BOT_TOKEN` | **Yes** | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | **Yes** | Your personal chat ID |
| `RESEND_API_KEY` | For email send | After approve |
| `RESEND_FROM_EMAIL` | Optional | Default: `Jonny <northside@northsideintelligence.com>` |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Webhook auth header |
| `AXON_WEBHOOK_URL` | Optional | Override default Vercel webhook URL |
| `AXON_DASHBOARD_SECRET` | **Yes** | Web UI login |
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
npm run telegram:setup # register slash commands
```

---

## Schedule

| Workflow | Cron (UTC) | EST |
|----------|------------|-----|
| AXON NI Outreach | `30 7 * * *` | 2:30 AM (after Hermes 2 AM) |
| AXON Telegram Poll | `*/15 * * * *` | Every 15 min fallback (skips when webhook active) |

---

## Guardrails

- No auto-send outbound
- Max 15 new drafts/day
- $20/mo API cap (monitor Anthropic console)
- Hermes stays separate — sync only, no LLM

---

## Repo map

```
app/           Next.js web UI (Jarvis + tools + outreach)
components/    AXON UI components
lib/           shared clients (supabase, ai, telegram, chat, resend)
api/           Vercel serverless (Telegram webhook + legacy API)
scripts/       outreach engine + telegram poll/setup
.github/       scheduled workflows
```
