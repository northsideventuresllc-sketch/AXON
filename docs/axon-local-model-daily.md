# AXON local daily model build (AX-MODEL-DAILY)

> Phase 1: keep **outreach + follow-up scoring** interactive inside AXON so JB is not paying extra SaaS/API loop costs for routine calibration.

Brand: **NORTHSiDE** · Operator: **JB** · Brain: NI-Brain `kxijunwgbrlfzvgkhklo`

---

## What it does

1. Pulls recent `axon_tool_edit_signals` + `ni_brain_outreach` rows (`source=axon_ni_services`)
2. Probes local **Ollama** (`OLLAMA_HOST`, default `http://127.0.0.1:11434`)
3. Scores a sample of leads with Ollama when online — otherwise a **deterministic heuristic** scorer (dry-run / CI safe)
4. Persists an audit row to `axon_local_model_runs`
5. Surfaces status + a one-click local score action in **NI Outreach HQ → Phase 1 workflow**

No auto-send. Telegram approve still required for outbound.

---

## Commands

```bash
# Dry-run (no NI-Brain writes) — passes without Ollama
npm run model:daily:dry

# Live run on Mac (needs SUPABASE_SERVICE_KEY + optional Ollama)
npm run model:daily

# Print Mac cron checklist
node scripts/axon-local-model-daily.mjs --checklist

# Force heuristic even if Ollama is up
AXON_LOCAL_MODEL_HEURISTIC=1 npm run model:daily:dry

# Unit tests
npm run test:local-model
```

---

## Mac cron checklist

1. Install Ollama + `ollama pull llama3.2`
2. Copy `.env.example` → `.env` with `SUPABASE_SERVICE_KEY`
3. `AXON_DRY_RUN=1 npm run model:daily` once — expect `provider: heuristic` or `ollama`
4. Cron example (7:00 AM local):

```cron
0 7 * * * cd ~/Projects/AXON && /usr/bin/npm run model:daily >>/tmp/axon-model-daily.log 2>&1
```

5. Confirm new rows in NI-Brain `axon_local_model_runs`
6. Open NI Outreach HQ — use the Phase 1 workflow strip (Find → Close)

---

## Phase 1 workflow interactivity

Defined as: **daily outreach and follow-up workflows live in AXON** (generate → local score → queue → approve → send → follow-up → close), reducing paid API/subscription usage for routine loops.

| Step | Where in AXON |
|------|----------------|
| Find | NI Outreach HQ → Generate leads |
| Score | Phase 1 strip → Run local score (`/api/axon/local-model`) |
| Draft / Approve | Queue tab + Telegram |
| Send | Approve path (Resend / LinkedIn manual) |
| Follow-up | Follow-Up tab |
| Close | Pipeline / Deal Tracker toward 4 paid clients |

---

## Env

| Var | Required | Notes |
|-----|----------|-------|
| `SUPABASE_SERVICE_KEY` | Live persist | NI-Brain service role |
| `OLLAMA_HOST` | No | Default localhost:11434 |
| `OLLAMA_MODEL` | No | Default `llama3.2` |
| `AXON_DRY_RUN` | No | `1` = no writes |
| `AXON_LOCAL_MODEL_HEURISTIC` | No | Force heuristic |

---

## Files

| Path | Role |
|------|------|
| `lib/local-model-daily.mjs` | Probe, heuristic, Ollama score, daily run |
| `scripts/axon-local-model-daily.mjs` | CLI / Mac cron entry |
| `app/api/axon/local-model/route.ts` | Status + run API |
| `components/axon/phase1-workflow-panel.tsx` | Interactive Phase 1 strip |
| `tests/local-model-daily.test.mjs` | Offline unit tests |
