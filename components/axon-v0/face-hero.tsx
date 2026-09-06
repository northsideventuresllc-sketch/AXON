'use client';

/**
 * THE FACE — the Dash home screen (Build Plan B, steps 1 and 2).
 *
 * Spec: docs/the-face/SPEC.md. `app/(axon-v0)/page.tsx` renders this at `/`; the old home
 * deck sits at `/deck` behind one quiet micro-label until it retires.
 *
 * Step 1 was the orb alone. Step 2 puts the dashboard around it without moving it: the orb
 * stays centre and dominant, two glass stat cards sit to its left, two to its right, and
 * the revenue card and the module list run underneath. On a narrow screen the orb is still
 * first and everything else flows below it.
 *
 * All five numbers and the orb's pulse come from one poll of `GET /api/axon-v0/face/summary`
 * every 15 seconds. Nothing on this screen is ever a made-up number: a source that did not
 * answer shows its written empty state. The voice bar (step 3) and the agent trail (step 4)
 * are still to come.
 *
 * `?working=1` pins the orb working, `?working=0` pins it resting.
 */
import Link from 'next/link';
import FaceOrbScene from '@/components/axon-v0/face-orb-scene';
import { FaceModuleList, FaceStatCard } from '@/components/axon-v0/face-stat-card';
import { useAgentWorkingSignal, usePrefersReducedMotion } from '@/lib/axon-v0/use-agent-working';
import { useFaceSummary } from '@/lib/axon-v0/use-face-summary';
import '@/components/axon-v0/face.css';

export function FaceHero() {
  const { summary, loading, live } = useFaceSummary();

  // The signal is only "live" when the route answered AND a real working source was
  // readable. A 200 with nothing behind it is not a live signal, and saying so would be a
  // claim we cannot back — so the orb falls back to the test swing and says demo.
  const signalLive = live && !!summary && summary.workingSource !== 'none';
  const { working, source } = useAgentWorkingSignal({
    live: signalLive,
    count: summary ? summary.agentsWorking : null,
  });
  const reducedMotion = usePrefersReducedMotion();

  const stateLabel = working ? 'Agents working' : 'Standby';
  const sentence = working
    ? 'Agents are working right now. The orb beats while they run.'
    : 'Nothing is running. The orb rests until an agent starts work.';

  // What the working number was actually counted from, said in plain English under the card.
  const workingCaption =
    summary?.workingSource === 'tickets'
      ? 'Agents on a job in the last ten minutes, counted from the ticket queue.'
      : 'Agents that checked in within the last ten minutes.';

  return (
    <section className="face-screen" aria-labelledby="face-heading">
      <h1 id="face-heading" className="sr-only">
        AXON mission control
      </h1>

      <div className="face-hero">
        <span className="face-reticle face-reticle--tl" aria-hidden />
        <span className="face-reticle face-reticle--tr" aria-hidden />
        <span className="face-reticle face-reticle--bl" aria-hidden />
        <span className="face-reticle face-reticle--br" aria-hidden />

        <div className="face-topbar">
          <span className="face-micro">AXON</span>
          <span className="face-micro">Mission Control</span>
          <span className="face-micro">Preview</span>
          <span className="face-micro" data-live={signalLive ? 'true' : 'false'}>
            {signalLive ? 'Signal: live' : 'Signal: demo'}
          </span>
        </div>

        <div className="face-grid">
          <div className="face-rail face-rail--left">
            <FaceStatCard
              label="Agents Live"
              value={summary ? summary.agentsLive : null}
              caption="Agents on the roster that are switched on."
              loading={loading}
            />
            <FaceStatCard
              label="Working Now"
              value={summary ? summary.agentsWorking : null}
              caption={workingCaption}
              loading={loading}
            />
          </div>

          <div className="face-centre">
            <div className="face-orb-wrap">
              <FaceOrbScene
                working={working}
                reducedMotion={reducedMotion}
                ariaLabel={`AXON — ${stateLabel}`}
              />
            </div>

            <div className="face-readout">
              <span className="face-state face-micro" data-working={working ? 'true' : 'false'}>
                <span className="face-state-dot" aria-hidden />
                {working ? 'Agents Working' : 'Standby'}
              </span>
              <p className="face-sentence">{sentence}</p>
              <p className="face-hint">
                {source === 'forced'
                  ? 'State is pinned by the address bar. Remove it from the address to let the orb follow the agents again.'
                  : source === 'live'
                    ? 'Live agent activity is driving the orb.'
                    : 'Test signal for now — the live one is not answering.'}
                {reducedMotion ? ' Motion is reduced, so the orb is holding still.' : ''}
              </p>
            </div>
          </div>

          <div className="face-rail face-rail--right">
            <FaceStatCard
              label="Open Tickets"
              value={summary ? summary.openTickets : null}
              caption="Jobs in the queue that are not finished, rejected or skipped."
              loading={loading}
            />
            <FaceStatCard
              label="Leads This Week"
              value={summary ? summary.leadsThisWeek : null}
              caption="Outreach leads added in the last seven days."
              loading={loading}
            />
          </div>
        </div>

        {/* The one way out of the hero until the deck's remaining cards fold in. */}
        <div className="face-footbar">
          <Link href="/deck" className="face-micro face-deck-link">
            Open Deck
          </Link>
        </div>
      </div>

      <div className="face-lower">
        <FaceStatCard
          label="Revenue"
          value={null}
          planned
          caption="The finance agent is dormant, so there is no money figure to show. This card stays blank on purpose rather than showing a number nobody has checked."
        />
        <FaceModuleList
          live={summary?.modules.live ?? []}
          planned={summary?.modules.planned ?? []}
          readable={summary ? summary.modules.readable : true}
          loading={loading}
        />
      </div>
    </section>
  );
}

export default FaceHero;
