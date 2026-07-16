# AXON wisdom absorb loop (AX-WISDOM-LOOP)

> Watch → digest → enhance → absorb. Mac ON / Slow Takeover path so NORTHSiDE AXON keeps durable operator wisdom without burning paid API quota.

## What it does

1. **Watch** — pulls ND research corpus, autonomous research findings, AXON `Learnings`, and communication signals from NI-Brain.
2. **Digest** — dedupes by fingerprint, scores salience (JB corrections and verified ND sources rank highest).
3. **Enhance** — posts top units into J-space (learning module) and builds a prompt block for chat.
4. **Absorb** — upserts `axon_wisdom_items` + writes `axon_wisdom_runs` audit row.

Heuristic is the default provider (CI / dry-run safe). Pass `--haiku` when `ANTHROPIC_API_KEY` is set for optional polish.

## Commands

```bash
npm run wisdom:dry          # no writes
npm run wisdom              # live absorb → NI-Brain
npm run wisdom -- --checklist
npm run test:wisdom
```

## NI-Brain tables

| Table | Purpose |
|-------|---------|
| `axon_wisdom_items` | Absorbed wisdom units (unique per operator + fingerprint) |
| `axon_wisdom_runs` | Run audit (watched / digested / enhanced / absorbed counts) |

Schema: `scripts/axon_wisdom_loop_bc.sql`

## Schedule (optional Mac cron)

```cron
30 6 * * * cd ~/Projects/AXON && /usr/bin/npm run wisdom >>/tmp/axon-wisdom.log 2>&1
```

Runs before `model:daily` so scoring inherits fresh wisdom.

## API

- `GET /api/axon/wisdom` — latest run + top absorbed items
- `POST /api/axon/wisdom` — `{ "dryRun": true }` or live run

## Guardrails

- No auto-send outbound
- No secrets in git
- Brand casing: **NORTHSiDE** · Operator: **JB**
