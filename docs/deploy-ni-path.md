# Deploy AXON at northsideintelligence.com/axon

AXON deploys from this repo to the Vercel **workspace** project (Git-connected to `northsideventuresllc-sketch/AXON`).

## 1. Vercel env vars (workspace project)

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

## 2. Proxy /axon on northsideintelligence.com

The **northside-intelligence** Vercel project owns `northsideintelligence.com`. Add rewrites so `/axon/*` proxies to the AXON deployment:

```json
{
  "rewrites": [
    {
      "source": "/axon",
      "destination": "https://workspace-git-main-northsideventuresllc-sketchs-projects.vercel.app/axon"
    },
    {
      "source": "/axon/:path*",
      "destination": "https://workspace-git-main-northsideventuresllc-sketchs-projects.vercel.app/axon/:path*"
    }
  ]
}
```

Merge into `northside-intelligence` project's `vercel.json`, then redeploy that project.

## 3. Deployment protection

If the workspace deployment requires Vercel login, disable **Deployment Protection** for production in Vercel → workspace → Settings → Deployment Protection (or add JB's team as bypass).

## 4. Verify

- `https://northsideintelligence.com/axon/login` — AXON login
- `https://northsideintelligence.com/axon` — Jarvis home (after login)

Production URL (direct): `https://workspace-git-main-northsideventuresllc-sketchs-projects.vercel.app/axon`
