# THE FACE — AXON mission-control UI

**Status:** steps 1, 2, 3 and 4 built. THE FACE is the Dash **home screen**, not a tab. The
orb, the dashboard around it, the voice panel and the agent activity trail are all live.
The top micro-bar still reads **Preview**. Step 5 (portal mirror check + marketing hero
export) is done — see section 12; the portal mirror itself stays off (no page in
northside-intelligence to mount it on yet).
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

### 2.3 Voice (step 3 — built)

A panel docked bottom-centre of the hero, under the orb: a hold-to-talk control with a mic
glyph drawn in CSS and inline SVG, a level meter, a thinking timer, a Mute micro-toggle and a
live transcript. Answering an instruction changes exactly one panel — the module list's slot
under the hero — and that panel carries a **Back** micro-label home.

Three states, each written as well as drawn:

| State | What is on screen |
|---|---|
| **Idle** | The mic glyph, dim, and one quiet `HOLD TO TALK` micro-label |
| **Listening** | The glyph lit cyan and a level meter whose bars are driven by the microphone's own `AnalyserNode` |
| **Thinking** | A monospaced timer counting `0.0s…` while the read is out; the orb pulses |

**Push-to-talk, never always-on.** Hold the button with a pointer, or focus it and hold
Space. On release, on unmount and on any failure every media track is stopped and the audio
context is closed, so the browser's recording indicator goes out — a screen that sits on a
wall must never be quietly listening.

**No dead UI.** Transcription uses the browser's own `SpeechRecognition` /
`webkitSpeechRecognition`, feature-detected. A browser without it (Firefox, or any page not
on a secure origin) gets a typed input **in the same panel, in the same styling**, running
the identical parser. A refused microphone says so in one sentence and leaves the typed
input working.

**Spoken reply.** `speechSynthesis`, feature-detected, reads one line saying what the panel
now shows. It is silent under `prefers-reduced-motion` and whenever the **Mute** micro-toggle
is on. Everything spoken is also on screen: the transcript carries `aria-live`, so nothing
is audio-only.

### 2.4 Agent trail (step 4 — built)

A glass card, right of the module list on a wide screen and below everything else on a
narrow one (see `.face-lower` in `face.css`): a monospaced all-caps `AGENT ACTIVITY` label
over a list of the last 30 minutes of `agent_bus` traffic, newest first. Each row is a small
dot, an agent name, a plain-English verb read off the subject, and a relative time
("2 min ago"). The dot brightens for anything under two minutes old — colour is never the
only signal, the relative time says the same thing in words.

**The trail never shows raw table names, ids or codes.** A subject like
`AXON-EXEC-AGENT-NIGHTLY-2026-09-06` never reaches the screen; `subjectToVerb` in
`lib/axon-v0/face-activity.mjs` turns it into a sentence fragment first ("posted the nightly
plan"). Unrecognised subjects fall back to "sent a message" rather than showing the raw
text. Empty state: **"No agent activity in the last 30 minutes"**. Unreadable: **"Not
answering"** — a genuinely quiet 30 minutes and a failed read are different sentences, same
as everywhere else on this screen.

Same 15-second poll cadence as the rest of the screen (`lib/axon-v0/use-face-activity.ts`,
same hidden-tab/in-flight/unmount discipline as `use-face-summary.ts`). The list carries
`aria-live="polite"` so new activity is announced without interrupting anything else being
read.

**Orb reaction.** A new bus row since the previous poll triggers one visible ~600ms
ring-brighten burst on the orb — implemented as a transient, non-React-state ref
(`burstSignal` prop on `FaceOrbScene`) so it never forces a scene rebuild. Under
`prefers-reduced-motion` there is no burst at all; only the trail's own dot brightens.

**Bus traffic now also drives the orb's pulse**, alongside the existing presence signal —
see 4.3.

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
- **Step 4 (built):** `GET /api/axon-v0/face/activity` adds a second, independent working
  signal: a presence heartbeat within ten minutes (unchanged) OR an `agent_bus` row within
  the last two minutes. Either source saying "working" beats the orb — see
  `resolveActivityWorking` in `lib/axon-v0/face-activity.mjs` and the combined precedence
  in `use-agent-working.ts`'s `useAgentWorkingSignal`. A fresh bus row also triggers the
  one-off burst described in 2.4. The hook's outward shape does not change: callers still
  get `{ working, source }`, `source` still reads `'forced' | 'live' | 'mock'`.

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

**What step 3 actually shipped — three commands, all read-only:**

| You say | What happens | Where it reads from |
|---|---|---|
| "Show me today's plan" | The day plan replaces the module list | `GET /api/axon-v0/face/plan` — EXEC's own daily post (see 5.1) |
| "What needs me" | Everything parked on your approval, in one list, no job codes | `GET /api/axon-v0/face/needs-me` — the queue: anything in the waiting-on-JB status or flagged for approval and not closed out |
| "Show agents" / "Back" | Back to the module list | Nothing — no request is made |
| Anything else | The transcript shows what was heard and the panel says **"I can't do that from here yet."**, naming the two nearest commands | Nothing. **No free-form speech reaches a model in step 3** — that is a later step and has to be grounded first |

Wording is normalised before matching: lower-cased, punctuation and curly apostrophes
stripped, an optional wake word ("axon", "hey axon") and leading filler ("please", "can you")
removed. So "Axon, please show me today's plan!" and "day plan" are the same instruction. The
grammar is pure and lives in `lib/axon-v0/face-commands.mjs`, tested offline in
`tests/face-commands.test.mjs`.

**Still to come, unchanged from the original set:**

| You say | What happens |
|---|---|
| "What's running right now?" | Module list filters to live agents; the orb goes to agents-working if any are |
| "How many leads do we have?" | Pipeline card enlarges and is read out |
| "What broke?" | Errors only, newest first, in plain English |
| "Stop" / "Cancel" | Cancels the current spoken answer immediately |
| "Go quiet" | Turns the voice replies off; the screen keeps working silently — the **Mute** micro-toggle already does this by hand |

### 5.1 Where the day plan comes from

**EXEC's own daily post on the agent bus.** The Executive agent writes one row a night to
`agent_bus`, addressed to everyone, subject `AXON-EXEC-AGENT-NIGHTLY-<date>`, with a JSON
body carrying a written `plain_english_summary` — one bullet per line, in EXEC's words. The
panel shows those lines, unedited: nothing is re-worded, summarised or padded here.

- **Fallback:** if there is no post for today, EXEC's own `session_notes_apartment` row for
  the same date is used instead, and the panel says which of the two it read.
- **Neither:** the panel says **"No plan posted yet today"** — a designed empty state for an
  empty day, not an error.
- **Unreadable:** if the sources could not be read at all, the panel says **"Not answering"**.
  That is deliberately a different sentence: an empty list would read as "nothing to do",
  which is a claim nobody checked.
- **Nothing is ever generated.** There is no third fallback and no model in this path.

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
  `step2-wide-SAMPLE-DATA.png` — the same screen fed **made-up sample rows** so the numbers,
  the pills and the working orb can be seen. **Nothing in that third image is a live figure**
  — it is a layout proof, not a reading of the business.

**Still open, and still JB's call:**

- Whether revenue stays a designed empty card or waits for Finance to be connected.
- Whether these are the right first cards, and whether the orb's size and beat read right.

## 10. What step 3 actually ships

- The voice panel, docked bottom-centre of the hero under the orb (the placement question
  left open at the end of step 2 — it sits between the state readout and the deck link, and
  neither moved).
- Three states — Idle, Listening with a real microphone level meter, Thinking with a
  monospaced timer — plus a live transcript carrying interim and final text.
- Push-to-talk on pointer hold or Space, real button semantics, a visible focus ring, and
  `aria-live` on the transcript. Never always-on; every track is stopped on release and on
  unmount.
- A typed input fallback in the same panel with identical styling for any browser without
  speech recognition, running the identical parser.
- Three read-only commands — today's plan, what needs you, show agents — each replacing
  exactly one panel, with a **Back** micro-label home. Anything else gets one plain sentence.
- A spoken one-line reply through `speechSynthesis`, muted under reduced motion or the Mute
  micro-toggle.
- Two new read-only server routes: `GET /api/axon-v0/face/plan` and
  `GET /api/axon-v0/face/needs-me`, both behind the dashboard session gate, both always
  answering 200 with a complete shape.
- The orb goes to Thinking while a command is pending — a transient override; the live
  working signal stays authoritative the moment the answer lands.
- Screenshots at 1440×900: `step3-idle.png` (the panel idle, hold-to-talk showing) and
  `step3-plan.png` (the day-plan panel open, driven through the typed fallback with the
  speech API removed so both controls are on the record). Both taken with **no database
  credentials**, so every card shows its empty state; the plan lines in the second image are
  EXEC's real post for 2026-09-06, replayed into the route so the panel could be shown.

**Still open, and still JB's call:**

- Whether the remaining commands in section 5 are the right next ones.
- Whether free-form speech ever reaches a model, and what it has to be grounded against
  first. Step 3 deliberately sends nothing.

## 11. What step 4 actually ships

- The agent activity trail (2.4): a glass card listing the last 30 minutes of `agent_bus`
  traffic, newest first, capped at 30 rows, each with a plain-English verb, a relative
  time and a dot that brightens under two minutes old. Empty and unreadable states written
  out, never a blank list standing in for either.
- One new route, `GET /api/axon-v0/face/activity` (`app/api/axon-v0/face/activity/route.ts`),
  reading `agent_bus` and `nvg_agent_presence` (with `agent_dispatch` as the same in-flight
  fallback `face-reads.ts` already uses), behind the dashboard session gate, always
  answering 200 with a complete shape.
- A pure shaping layer, `lib/axon-v0/face-activity.mjs` — the subject-to-verb map, relative
  time, trail shaping and the working-signal precedence — tested offline with no database
  credentials in `tests/face-activity.test.mjs`.
- The orb's working signal now takes this feed as a second, independent source alongside
  the existing presence/tickets count (4.3), and reacts to a new bus row with one visible
  ~600ms ring-brighten burst, skipped under reduced motion.
- A poll on the same 15-second cadence as the rest of the screen
  (`lib/axon-v0/use-face-activity.ts`), same hidden-tab/in-flight/unmount discipline as
  `use-face-summary.ts`.
- A screenshot at a 1440×900 viewport (`docs/the-face/step4-trail-SAMPLE-DATA.png`, full
  page — the trail sits in the lower band, below the first 900px) with the activity route
  stubbed to **made-up sample rows** so the trail, the dots and a working orb can be seen.
  Every other route ran with no database credentials, so the stat cards and module list show
  their real empty states in the same shot. Nothing in that image is a live figure — it is a
  layout proof, not a reading of the business.

**Still open, and still JB's call:**

- Whether the beat rate should scale with how many distinct agents posted recently (the
  original step-4 sketch in 4.3 mentioned this, capped at four so it never strobes) — step 4
  as built keeps the beat binary (working / resting) and layers the burst on top instead.
- Whether the trail should eventually draw the cyan filament from the orb toward the
  module that produced each row, as the original sketch in 2.4 described, rather than
  living in its own card.

## 12. What step 5 actually ships (portal mirror + marketing hero export)

Step 5 is a plumbing-and-asset step, not a Face feature — nothing under `components/axon-v0`,
`lib/axon-v0`, `use-agent-working.ts`, or `app/(axon-v0)`/`app/api/axon-v0/face` changed.

**Portal mirror — checked, not enabled.** `scripts/sync-portal-ui.mjs`'s `V0_COMPONENT_FILES`
/ `V0_LIB_FILES` / `V0_API_FILES` lists were brought up to date with every current Face file
(main plus the step 4 branch, `activity-trail`/`use-agent-working` included) so the lists are
correct and ready. They stay inside the existing `void V0_*` no-op, so **nothing Face-related
is written to the portal by this step**:

- northside-intelligence's `main` has no `src/app/(axon-v0)` route group and no page anywhere
  that mounts an axon-v0 screen — confirmed against the live repo. The only axon-v0 work
  there lives on two unmerged branches (`claude/axon-v0-setup-vsog4h`,
  `claude/axon-v0-migration-plan-sfv8o3`); neither reached `main`. There is no existing
  "how an axon-v0 page lands in the portal" pattern to copy, so per this step's own
  instruction ("if no pattern exists, STOP that half and report"), no portal page wiring was
  invented here. Even if a page existed, the v0 API's `generateAxonReply` signature still
  doesn't match the portal's copy (the documented 2026-08-26 incident reason the whole v0
  harness stays un-synced) — that fix is separate work, out of scope for a mirror-list update.
- Verified: `node scripts/sync-portal-ui.mjs <scratch-copy-of-northside-intelligence> --check`
  → 186 writes planned, **0 breaking removals** (the axon-ui/axon-lib mirror this script
  actually performs is untouched by the Face-list update). `npm test` (167/167, including
  `tests/portal-sync-drift.test.mjs`) and `npx tsc --noEmit` both pass clean.
- **What real portal-hosting of Face would still need:** a `src/app/(axon-v0)` route group
  in northside-intelligence (or an equivalent page shell) that mounts the Face home, a
  portal-side `generateAxonReply` compatible with the v0 API signature, and then the
  `void V0_*` no-op replaced with real write loops (mirroring the pattern the flat
  `COMPONENT_FILES`/`LIB_FILES`/`API_FILES` loops already use) — none of which exists yet.

**Marketing hero export — shipped.** `scripts/face-hero-export.mjs` drives a real
`/?working=0` → `/?working=1` pass through the running dev server with Playwright
(`recordVideo`, 1920×1080), logging in through `POST /api/auth/login` first (no login
screen in the recording). Output: `docs/the-face/hero-export/orb-hero-1080p.webm` (resting
~4s, then working ~8s) and a still, `orb-hero-1080p.png`, taken mid-working. Usage and the
resting/working loop + palette notes: `docs/the-face/hero-export/README.md`. No new
dependency — the script resolves the Playwright package that is already installed globally
in this environment rather than adding it to `package.json`.
