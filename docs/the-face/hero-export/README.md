# THE FACE — marketing hero export

What's here:

- `orb-hero-1080p.webm` — a short 1920×1080 clip of the orb: resting (~4s), then working
  (~8s). Recorded from the running app, not hand-animated.
- `orb-hero-1080p.png` — a 1920×1080 still of the orb mid-working, pulled from the same run.

## What it's for

Marketing/landing assets that need a real shot of the orb rather than a screenshot of the
whole dashboard. The clip carries the resting → working transition so it reads as "alive"
even as a silent loop.

## The resting → working loop

The orb has exactly two states, both driven by the `?working=` URL override (see
`lib/axon-v0/use-agent-working.ts` and `docs/the-face/SPEC.md` section 3 — this file
doesn't repeat that logic, just points at it):

- `?working=0` — resting. Slow breathing motion, muted palette.
- `?working=1` — agents working. The orb pulses/beats faster; the state label and stat
  card above it switch to "Agents Working".

The export always does resting first, then working, because that's the more interesting
transition to have in a loop and it's the state most worth stopping on for the still.

## Palette

Whatever `face.css` / the orb scene currently ship — this export does not apply its own
color treatment, it just records what's live. If the brand palette on the orb changes,
re-run the export; don't hand-edit the video.

## How to re-run it

```bash
AXON_DASHBOARD_SECRET=<your local dashboard secret> \
  node scripts/face-hero-export.mjs [--out docs/the-face/hero-export] [--seconds 8] \
                                     [--rest-seconds 4] [--port 3123]
```

Requirements:

- `PLAYWRIGHT_BROWSERS_PATH` pointed at a chromium install (this environment already sets
  it to `/opt/pw-browsers`).
- Playwright itself does not need to be a project dependency — the script resolves
  whatever `playwright` package is already installed in the environment (falling back to
  the global CLI package's install location) rather than adding one to `package.json`.
- The script starts and stops its own `next dev` on `--port` (default 3123); it does not
  touch a server you already have running on another port.
- It logs in via `POST /api/auth/login` before recording (see `middleware.ts` and
  `app/api/auth/login/route.ts`) so the login screen itself is never in the shot.

The script refuses (non-zero exit) if the resulting `.webm` comes out over 15 MB — lower
`--seconds` and re-run rather than committing an oversized file. Never commit anything over
15 MB to this repo regardless of source.
