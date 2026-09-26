---
type: reference
id: R-JB-QUESTION-BOX
title: "Every question for JB goes in a box at the top"
priority: must
kind: rule
status: active
canonical: true
scope:
  agents: [ALL]
  ventures: [ALL]
  harnesses: [ALL]
triggers: ["jb", "approval", "question", "decision", "telegram", "report", "close-out", "needs approval"]
source: "JB direct, live 2026-09-24 — NI-Brain Decision #2013"
lives_in:
  - "nvg-operator-core §9"
  - "_meta/rulebook/style-cards/telegram-approval-card.md"
version: 1
updated: 2026-09-24
superseded_by: 
owner: COUNCIL
tags: [rulebook, must, adhd, comms, approvals]
---

Anything JB must see or answer goes in a **box outline** (or a table) at the **top** of the message — one question per box, with the exact reply options inside it (e.g. `Reply: YES or NO`). Never bury a question inside status text, and never rely on bold alone: bold does not always register for JB. Status that needs no answer goes below the box in short tables. Telegram cards draw the box in a `<pre>` block, under ~32 characters wide so it fits a phone, followed by 2-4 specific buttons (never only Approve/Reject).

Example:

```
┌──────────────────────────────┐
│ Ship the new login page?     │
│ Reply: YES or NO             │
└──────────────────────────────┘
```

See [[_meta/rulebook/INDEX|Rulebook Index]].
