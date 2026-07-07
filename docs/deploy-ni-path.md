# Deploy AXON with Northside Intelligence portal

AXON has **two surfaces**:

| Surface | Repo | URL |
|---------|------|-----|
| **NI portal (master)** | `northside-intelligence` | `northsideintelligence.com/axon-{username}/dashboard` |
| **Standalone app** | this repo → Vercel **workspace** | `workspace-*.vercel.app/axon` |

Public waitlist lives at `northsideintelligence.com/axon` (NI portal, not this repo).

## 1. Standalone Vercel env (workspace project)

Set in [Vercel → workspace → Settings → Environment Variables](https://vercel.com):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_BASE_PATH` | `/axon` |
| `SUPABASE_SERVICE_KEY` | NI-Brain service role |
| `ANTHROPIC_API_KEY` | Haiku chat + drafts |
| `AXON_DASHBOARD_SECRET` | Web UI login password |
| `GEMINI_API_KEY` | Optional — outreach |
| `SERPAPI_API_KEY` | Optional — outreach |
| `TELEGRAM_BOT_TOKEN` | Telegram |
| `TELEGRAM_CHAT_ID` | Telegram |
| `RESEND_API_KEY` | Email send |

Redeploy after adding env vars.

## 2. Sync UI into NI portal (required after AXON UI changes)

The portal embeds AXON UI from `northside-intelligence/src/components/axon-ui/`. It does **not** auto-deploy from this repo.

```bash
git clone https://github.com/northsideventuresllc-sketch/northside-intelligence.git
node scripts/sync-portal-ui.mjs ./northside-intelligence
cd northside-intelligence
npm install && npm run build
# commit + merge PR in northside-intelligence
```

This copies components, lib modules, API routes, and CSS from AXON → NI portal.

**GitHub access:** See [docs/cursor-github-access.md](./cursor-github-access.md) — grant `cursor[bot]` or set `NI_GITHUB_PAT` for automated sync via `.github/workflows/sync-ni-portal.yml`.

## 3. NI portal env (northside-intelligence Vercel project)

Required for portal AXON routes:

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_KEY` | NI-Brain |
| `ANTHROPIC_API_KEY` | Chat |
| `AXON_SESSION_SECRET` or `NI_ADMIN_SECRET` | Portal AXON session cookie |
| `AXON_MASTER_ACCESS_CODE` | Master account access provisioning |

## 4. Verify

| URL | Expected |
|-----|----------|
| `https://northsideintelligence.com/axon` | Waitlist landing |
| `https://northsideintelligence.com/axon-{username}/dashboard` | Latest AXON UI (master, signed in) |
| `https://northsideintelligence.com/axon-{username}/queue` | Approval queue (sidebar nav) |
| `https://northsideintelligence.com/axon-{username}/pipeline` | Full pipeline |
| `https://workspace-git-main-northsideventuresllc-sketchs-projects.vercel.app/axon/login` | Standalone password login |

**Standalone basePath:** middleware and auth cookies must use `NEXT_PUBLIC_BASE_PATH` — unauthenticated redirects go to `/axon/login`, not `/login` (404).

Telegram webhook (production): root Vercel URL `/api/telegram-webhook` on the **workspace** project — not the NI portal path.

## 5. Deployment protection

If the workspace deployment requires Vercel login, disable **Deployment Protection** for production in Vercel → workspace → Settings → Deployment Protection.
