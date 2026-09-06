# THE FACE — AXON mission-control UI

**Status:** step 1 draft, for JB to react to. Nothing here is built beyond the brain-orb hero.
**Repo:** `AXON` · lives in the `(axon-v0)` Dash · **not** mirrored to the NI portal yet.
**Source plan:** nv-vault `_Command Center/Build Plans/Build Plan B — THE FACE (AXON mission-control UI).md`

---

## 1. What it is, in one paragraph

THE FACE is the screen you look at to know what AXON is doing. It is dark and full-bleed.
In the middle sits a living brain orb — rings around a glowing burst of light. The orb
**pulses** while agents are working and **rests** when nothing is running. Around the orb
sit glass cards with the numbers that matter, a list of which agents are live and which are
still planned, and a voice panel you can talk to. You ask for something, one panel changes,
and you can watch the agents work while they answer.

---

## 2. Screens

### 2.1 Hero (built in step 1)

Full-bleed dark scene, the orb centred, corner-bracket reticles at the four corners of the
viewport, one monospaced all-caps micro-label under the orb reading the current state, and a
single line of plain-English status. Nothing else competes with the orb.

### 2.2 Mission control (step 2)

The hero shrinks to the upper third. Below it, three regions:

- **Left rail — Modules.** Every agent, marked LIVE or PLANNED.
- **Centre — Numbers.** Four to six stat cards.
- **Right rail — Activity.** The newest lines of agent traffic, newest at the top.

### 2.3 Voice (step 3)

A bar pinned to the bottom of the hero: a microphone control, a thinking timer, and a live
transcript that scrolls up. Answering an instruction changes exactly one panel, and that
panel flashes its border once so you can see which one moved.

### 2.4 Agent trail (step 4)

Each line of agent traffic draws a short cyan filament from the orb toward the module that
produced it, then fades. Bus traffic drives the orb's pulse instead of the mock signal.

---

## 3. States

The whole screen has one state at a time. The orb, the micro-label and the border treatment
all read from it.

| State | When | Orb | Label | Rest of screen |
|---|---|---|---|---|
| **Resting** | Nothing running | Slow drift, gentle breathe, dim rings | `STANDBY` | Cards calm, borders at 25% |
| **Listening** | Microphone open | Rings widen and hold, core brightens | `LISTENING` | Voice bar raised, transcript cursor blinking |
| **Thinking** | A request is being worked out | Tight fast shimmer, rings counter-rotate | `THINKING` | Timer counts up in the voice bar |
| **Agents working** | One or more agents are running | Strong rhythmic pulse, shell expands on the beat | `AGENTS WORKING` | Active module rows lit, activity feed streaming |
| **Error** | A data source failed, or an agent errored | Pulse stops, orb holds a steady dim core, rings stop | `ATTENTION` | The one broken panel shows a plain sentence saying what is not loading; every other panel keeps its last good numbers |

Rules that hold across all five:

- **Never a blank screen.** A panel with no data shows a designed empty state, never a spinner
  that lives forever and never a raw error.
- **Error is local.** One failed source darkens one card. It never takes the orb or the page down.
- **No green anywhere**, in any state, including success and error treatments.

---

## 4. Where every number comes from

Everything below is already reachable in this repo. No new backend is needed for step 2.

### 4.1 Stat cards

| Card | Reads from | Route in this repo |
|---|---|---|
| Agents live now | NI-Brain view `v_fleet_live_status` | `GET /api/axon-v0/fleet-status` |
| Agents on the roster | NI-Brain `nvg_agent_routines` | `GET /api/axon-v0/roster` |
| Leads in the pipeline | NI-Brain `ni_brain_outreach` (`source=axon_ni_services`) | **No route today.** See the note below |
| Model spend runway | NI-Brain view `v_usage_runway` | `GET /api/axon-v0/usage` |
| Jobs waiting on you | NI-Brain notifications | `GET /api/axon-v0/notifications` |
| Revenue | **Not wired.** Finance is not connected yet | Ships as a designed PLANNED card, never a fake number |

**Leads has no endpoint right now.** The old `/api/stats` route was deleted when the leads
dashboard was cleaned up, and nothing replaced it. The counting logic itself survives in
`lib/leads.ts` (`fetchPipelineStats`), so a small read-only route has to be added under
`/api/axon-v0/` — matching the pattern of the other panels here, which all fail soft and
always return a 200 — **before step 2 builds this card**. Until that route exists the card
ships as a designed empty state, never a hardcoded number.

### 4.2 Module LIVE / PLANNED list

One row per row of `nvg_agent_routines`, through `GET /api/axon-v0/roster`.

- **LIVE** — the routine is not retired and has run inside its own expected window.
- **PLANNED** — the row exists but has never run, or is marked retired.

The list never hardcodes agent names. If the roster is empty the panel says so in one sentence.

### 4.3 Orb pulse

- **Step 1 (now):** a mock signal in `lib/axon-v0/use-agent-working.ts` that swings between
  resting and working every few seconds, plus `?working=1` / `?working=0` to pin it.
- **Step 4 (real):** `GET /api/axon-v0/comms-feed`, which reads NI-Brain view
  `v_agent_comms_feed`. Any new row inside the last 90 seconds counts as work in progress.
  The beat rate follows how many distinct agents posted, capped at four so it never strobes.

### 4.4 Fire gate

The screen always shows whether AXON is on hold or cleared to fire, read from
`GET /api/axon/fire-gate`. Hold is stated plainly — "AXON is holding. Nothing sends until
you say go." — never as a status code.

---

## 5. Voice command grammar

Voice is deliberately small. A short list that always works beats a wide list that
half-works. Every command is a plain sentence; every command changes exactly one panel and
says out loud what it did.

**The first command, and the one everything else is modelled on:**

> **"Show me today's plan."**
> The activity rail is replaced by the day plan. AXON reads back the first three items.

The rest of the starting set:

| You say | What happens |
|---|---|
| "Show me today's plan" | Day plan replaces the activity rail |
| "What's running right now?" | Module list filters to live agents; the orb goes to agents-working if any are |
| "How many leads do we have?" | Pipeline card enlarges and is read out |
| "What needs me?" | Anything waiting on your approval, in one list |
| "What broke?" | Errors only, newest first, in plain English |
| "Stop" / "Cancel" | Cancels the current spoken answer immediately |
| "Go quiet" | Turns the voice replies off; the screen keeps working silently |

Rules:

- **Shape:** an optional wake word, then a verb, then a thing. "Show me / tell me / what's" +
  a subject. Unknown wording gets one plain reply naming the two nearest commands — never a
  list of everything, never an error code.
- **Nothing acts on the world.** Voice reads and shows. It never sends, posts, spends or
  fires. Those stay behind your Telegram button, exactly as they are today.
- **Everything spoken is also on screen.** The transcript is the record; audio is a
  convenience layer over it.

---

## 6. Accessibility and reduced motion

- **Reduced motion** (`prefers-reduced-motion: reduce`) — the orb renders a single still frame
  and does nothing but a slow opacity breathe. No rotation, no pulsing, no moving particles.
  All state changes become label and border changes only. Already implemented in step 1.
- **State is never colour alone.** Every state carries its own written micro-label, so the
  screen is readable with no colour perception at all.
- **The orb is decoration with a name.** It carries an image role and a label that says the
  state in words, so a screen reader hears "AXON — agents working" and nothing else from the
  canvas.
- **Keyboard first.** Every panel is reachable by tab in reading order; the voice control is a
  real button with a visible focus ring, not a click target on the orb.
- **Contrast.** Body text sits at or above 4.5:1 on the `#07080C` ground. Cyan is used for
  edges, labels and light — never for long body copy on the dark ground.
- **Voice is optional, never required.** Every voice command has a visible control that does
  the same thing.
- **No flashing.** Nothing on this screen flashes faster than three times a second, in any
  state, including errors.

---

## 7. Look and feel (locked)

- **Palette, exactly:** ground `#07080C`, cyan `#00D4FF`, navy `#0A1628`. **No green.**
- **Chrome:** corner-bracket reticles, monospaced all-caps micro-labels, thin cyan card
  borders at low opacity.
- **Depth comes from light, not from texture** — a glowing core, thin rings, and dark space.
  No stock-3D look, no gradient mush, no drop shadows pretending to be depth.
- **Labels are plain English.** No table names, no status codes, no acronyms on screen.
  A raw value from a database always gets a written label before it is displayed.

---

## 8. What step 1 actually ships

- This document.
- A working brain orb at `/face` in the Dash, drawn with Three.js: a glowing neural burst,
  three rings, corner reticles, a state label, driven by a mock working signal with
  `?working=1` to force it, and a still frame under reduced motion.
- A nav entry so the page is reachable.
- Nothing added to the portal mirror.

## 9. What step 2 needs before it starts

- JB's reaction to the orb — size, brightness, beat speed, and whether the rings read right.
- A decision on whether revenue stays a planned card or waits for Finance to be connected.
- Confirmation that the six stat cards in section 4.1 are the six he wants first.
