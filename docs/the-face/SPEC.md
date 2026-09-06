# THE FACE — AXON mission-control UI

**Status:** steps 1 and 2 built. THE FACE is the Dash **home screen**, not a tab. The orb and
the dashboard around it are live; the voice bar (step 3) and the agent trail (step 4) are not.
The top micro-bar still reads **Preview**.
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

## 1a. Where it lives (JB, 2026-09-06 — "The Face shouldn't be a tab")

THE FACE **is** the Dash home screen. Opening the Dash lands on the orb; there is no Face
tab to find, and the logo in the top bar is the way back to it.

| Route | What is there |
|---|---|
| `/` | THE FACE. The hero, full-bleed. `app/(axon-v0)/page.tsx` → `components/axon-v0/face-hero.tsx`. |
| `/deck` | The old home deck, visually unchanged, until step 2 folds its cards around the orb. One quiet `OPEN DECK` micro-label at the bottom of the hero is the way in. |
| `/face` | Permanently redirects to `/`. Kept only so an old bookmark still lands somewhere real. |

The top nav carries no Face entry. When step 2 folds the deck's cards into the hero, `/deck`
and that micro-label both retire.

---

## 2. Screens

### 2.1 Hero (built in step 1)

Full-bleed dark scene, the orb centred, corner-bracket reticles at the four corners of the
viewport, one monospaced all-caps micro-label under the orb reading the current state, and a
single line of plain-English status. Nothing else competes with the orb.

### 2.2 Mission control (step 2 — built)

The orb does **not** shrink to a strip. It keeps the middle of the screen and stays the
biggest thing on it; the dashboard is arranged around it:

- **Left of the orb** — Agents live, Working now.
- **Right of the orb** — Open tickets, Leads this week.
- **Under the hero** — the Revenue card (a designed empty state) and the module list,
  every agent grouped LIVE / PLANNED with a plain-word state pill.

On a screen narrower than 900px the orb is still first and the cards flow underneath it.
The activity rail is deliberately **not** here — it arrives with the agent trail in step 4.

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

**One route feeds the whole screen.** Step 2 added `GET /api/axon-v0/face/summary`
(`app/api/axon-v0/face/summary/route.ts`), which reads all four NI-Brain tables server-side
and returns a single JSON object. The screen polls it every 15 seconds — one request, not
five. Reads live in `lib/axon-v0/face-reads.ts`; all the counting and grouping is pure and
lives in `lib/axon-v0/face-summary.mjs`, tested offline in `tests/face-summary.test.mjs`.

### 4.1 Stat cards (built)

| Card | The number | Table read | Empty state |
|---|---|---|---|
| Agents live | Roster rows that are switched on and not archived or retired | `nvg_agent_routines` | "No data yet" |
| Working now | Heartbeats inside the last 10 minutes on a row that is not idle | `nvg_agent_presence` (`last_seen_at`) | "No data yet" |
| Open tickets | Queue rows that are not done, rejected or skipped | `agent_dispatch` | "No data yet" |
| Leads this week | Leads created in the last 7 days | `ni_brain_outreach` (`source=axon_ni_services`) | "No data yet" |
| Revenue | **None.** The finance agent is dormant | — | "Not wired", said in a written sentence |

**`skipped` counts as closed** alongside done and rejected: a skipped ticket was deliberately
closed out without being run, so counting it as open would put a much larger, misleading
number on the home screen.

**The house rule, in code:** a source that could not be read comes back as `null`, never `0`.
`null` is what draws the written empty state. A zero on this screen is always a real zero.

### 4.2 Module LIVE / PLANNED list (built)

One row per row of `nvg_agent_routines`, through the same summary route.

- **LIVE** — switched on, not retired, not archived.
- **PLANNED** — switched off, retired, or archived.

Health is a plain-word state pill, never a status code:

| Stored health | On screen | Pill |
|---|---|---|
| `healthy` / `ok` | On track | Filled cyan |
| `stale`, or anything unrecognised on a live row | Quiet | Dim cyan outline |
| `degraded`, `down`, `error`, `failing`, `critical` | Needs attention | Hollow cyan, brighter edge |
| `archived` / retired / switched off | Off | Muted grey |

The list never hardcodes agent names — they are the roster's own, exactly as stored. If the
roster cannot be read the panel says so in one sentence and nothing else on the screen moves.

### 4.3 Orb pulse

- **Step 2 (now):** the same **Working now** count above beats the orb — presence heartbeats
  inside the last ten minutes. If `nvg_agent_presence` cannot be read, the count falls back
  to `agent_dispatch` rows in an in-flight status touched in the same window, and the route
  says which of the two it used. `?working=1` / `?working=0` still pin the orb.
- **When neither source answers,** the orb falls back to the step-1 mock swing so it never
  sits dead behind a failed read. The top micro-bar says which is running: **Signal: live**
  or **Signal: demo**. A 200 with nothing readable behind it counts as demo, not live.
- **Step 4 (still to come):** `GET /api/axon-v0/comms-feed` (NI-Brain view
  `v_agent_comms_feed`) takes over the count — any row inside the last 90 seconds is work in
  progress — and sets the beat rate from how many distinct agents posted, capped at four so
  it never strobes. The hook's shape does not change when it does.

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
- A working brain orb on the Dash home screen (`/`), drawn with Three.js: a glowing neural
  burst, three rings, corner reticles, a state label, driven by a mock working signal with
  `?working=1` to force it, and a still frame plus a slow opacity breathe under reduced motion.
- The old home deck kept whole at `/deck`, reachable from one quiet label on the hero.
- `/face` left as a permanent redirect to `/`. No Face entry in the nav.
- Nothing added to the portal mirror.

The orb also survives the things a long-lived canvas actually meets: losing the WebGL
context swaps in the still bloom and getting it back rebuilds the scene, the loop stops on a
hidden tab and on unmount, resizes are throttled, and the pixel ratio is capped at 2.

## 9. What step 2 actually ships

- Five glass stat cards around the orb — thin cyan border, dark glass, corner-bracket
  reticle, monospaced all-caps micro-label, big tabular number — each with its own written
  loading and empty state.
- The module list: every roster agent, grouped Live / Planned, health as a plain-word pill.
- One new server route, `GET /api/axon-v0/face/summary`, reading four NI-Brain tables and
  always answering 200 with a complete shape, so one bad source darkens one card only.
- A real working signal driving the orb, with the mock kept as the fallback and the
  micro-bar saying which is running.
- The orb unmoved: still centre, still the biggest thing on the screen, cards flowing under
  it on narrow screens. Reticles, the top micro-bar and the OPEN DECK link all kept.
- Screenshots of the built screen: `step2-wide.png` (1440×900) and `step2-narrow.png`
  (390×844), both taken with no database credentials so they show the empty states, plus
  `step2-wide-with-data.png` — the same screen with roster-shaped rows, showing the numbers,
  the pills and the working orb.

**Still open, and still JB's call:**

- Whether revenue stays a designed empty card or waits for Finance to be connected.
- Whether these are the right first cards, and whether the orb's size and beat read right.

## 10. What step 3 needs before it starts

- The voice bar's placement now the cards are in — it was specified as pinned to the bottom
  of the hero, which is where the state readout and the deck link now sit.
