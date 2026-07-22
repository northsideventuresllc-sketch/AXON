# AXON user communication adaptation skill (AX-COMM-SKILL)
> Background skill that keeps AXON talking like JB expects — short, one outcome per message, answer-first, no meta narration.

Brand: **NORTHSiDE** · Operator: **JB** · Brain: NI-Brain `kxijunwgbrlfzvgkhklo`

---

## Dual-brain protocol

| Brain | Role |
|-------|------|
| **Vault** (`AGENTS.md` + `CLAUDE.md`) | Operating SOP — brand casing, no auto-send, Telegram approve, secrets out of git |
| **NI-Brain** | Runtime memory — `axon_communication_profile` (techniques) + `axon_communication_signals` (evidence) + operator tone preset |

Agents load vault SOP first, then adapt live replies from NI-Brain technique weights and signals.

---

## What it does

1. Loads technique catalog from `axon_communication_profile` (falls back to T1–T6 defaults)
2. Injects **silent** communication instructions into web + Telegram system prompts (never narrates techniques to JB)
3. Background run maps communication signals → technique weight bumps (heuristic, no LLM required)
4. Persists an audit row to `axon_comm_skill_runs`
5. Surfaces in Droid Space cron catalog as **Communication Adapt**

No auto-send. Telegram approve still required for outbound.

---

## Core techniques (seed / catalog)

| ID | Behavior |
|----|----------|
| T1 | One ask / outcome per message |
| T2 | Narrative in Telegram — never a bulleted/numbered list of jobs or technical items; chat bullets OK for data, capped at 3 |
| T3 | Lead with answer or next action |
| T4 | No meta narration of process/techniques |
| T5 | Plain human language — jargon only when asked |
| T6 | `NORTHSiDE` exact casing; operator JB |

---

## Commands

```bash
# Dry-run (no NI-Brain writes)
npm run comm:skill:dry

# Live reinforce technique weights + write run row
npm run comm:skill

# Checklist
node scripts/axon-comm-skill.mjs --checklist

# Unit tests
npm run test:comm-skill
```

---

## API

`POST /api/axon/comm-skill` — run background adapt (same path as script).  
`GET /api/axon/comm-skill` — preview current prompt block + technique weights.

Also reachable via existing `POST /api/axon/learning/refresh` (tone preset re-synthesis still available).

---

## Env

| Var | Required | Notes |
|-----|----------|-------|
| `SUPABASE_SERVICE_KEY` | Live persist | NI-Brain service role |
| `AXON_DRY_RUN` | No | `1` = no writes |

---

## Wiring

- Web chat: `lib/axon-web-chat.ts` → `buildToneInstructions(..., techniques, channel)`
- Telegram: `lib/axon-telegram-chat.mjs` → `loadCommSkillBlock(sbSelect)`
- Core: `lib/axon-comm-skill.mjs`
- Cursor agent skill: `.cursor/skills/axon-user-communication/SKILL.md`
