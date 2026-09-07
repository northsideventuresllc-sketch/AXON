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
 * answer shows its written empty state.
 *
 * Step 3 adds the voice panel under the orb: hold to talk, a level meter driven by the real
 * microphone, a thinking timer, a live transcript, and a spoken one-line reply. Three
 * read-only commands — today's plan, what needs you, show agents — each of which replaces
 * exactly one panel. Nothing is sent to a model and nothing acts on the world.
 *
 * Step 4 adds the agent activity trail: the last 30 minutes of `agent_bus` traffic, newest
 * first, right of the module list on a wide screen and below everything on a narrow one.
 * Its own working signal (a presence heartbeat within ten minutes OR a bus row within the
 * last two) ORs into the orb's pulse alongside the summary route's count, and a new row
 * since the last poll triggers one visible burst on the orb.
 *
 * `?working=1` pins the orb working, `?working=0` pins it resting.
 */
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import FaceActivityTrail from '@/components/axon-v0/face-activity-trail';
import FaceCommandPanel from '@/components/axon-v0/face-command-panel';
import FaceOrbScene from '@/components/axon-v0/face-orb-scene';
import { FaceModuleList, FaceStatCard } from '@/components/axon-v0/face-stat-card';
import FaceVoicePanel from '@/components/axon-v0/face-voice-panel';
import { useAgentWorkingSignal, usePrefersReducedMotion } from '@/lib/axon-v0/use-agent-working';
import { useFaceActivity } from '@/lib/axon-v0/use-face-activity';
import { useFaceCommands } from '@/lib/axon-v0/use-face-commands';
import { useFaceSummary } from '@/lib/axon-v0/use-face-summary';
import { useFaceVoice } from '@/lib/axon-v0/use-face-voice';
import '@/components/axon-v0/face.css';

export function FaceHero() {
  const { summary, loading, live } = useFaceSummary();
  const { activity, loading: activityLoading, live: activityLive, burstToken } = useFaceActivity();

  // The signal is only "live" when the route answered AND a real working source was
  // readable. A 200 with nothing behind it is not a live signal, and saying so would be a
  // claim we cannot back — so the orb falls back to the test swing and says demo.
  const signalLive = live && !!summary && summary.workingSource !== 'none';
  const { working, source } = useAgentWorkingSignal({
    live: signalLive,
    count: summary ? summary.agentsWorking : null,
    activityWorking: activityLive ? (activity?.workingNow ?? null) : null,
  });
  const reducedMotion = usePrefersReducedMotion();

  // Spoken replies are off under reduced motion, and off whenever the Mute micro-toggle is
  // on. Everything spoken is on screen anyway, so muting loses nothing.
  const [muteToggle, setMuteToggle] = useState(false);
  const muted = muteToggle || reducedMotion;

  // The microphone hands a heard sentence to the command runner, and the command runner
  // speaks its reply back through the microphone hook. One ref breaks that circle without
  // either hook having to know about the other.
  const runRef = useRef<(text: string) => void>(() => {});
  const onHeard = useCallback((text: string) => runRef.current(text), []);
  const voice = useFaceVoice({ onHeard, muted });
  const commands = useFaceCommands({
    speak: voice.speak,
    moduleCount: summary ? summary.modules.total : null,
  });
  runRef.current = commands.run;

  const toggleMute = useCallback(() => {
    voice.cancelSpeech();
    setMuteToggle((was) => !was);
  }, [voice]);

  // While a command is being worked out the orb goes to Thinking — a transient override on
  // top of the live signal, which stays authoritative the moment the answer lands.
  const thinking = commands.pending;
  const orbWorking = working || thinking;

  const stateLabel = thinking ? 'Thinking' : working ? 'Agents working' : 'Standby';
  const sentence = thinking
    ? 'Working out the answer. The orb holds the beat until it lands.'
    : working
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
                working={orbWorking}
                reducedMotion={reducedMotion}
                ariaLabel={`AXON — ${stateLabel}`}
                burstSignal={burstToken}
              />
            </div>

            <div className="face-readout">
              <span className="face-state face-micro" data-working={orbWorking ? 'true' : 'false'}>
                <span className="face-state-dot" aria-hidden />
                {thinking ? 'Thinking' : working ? 'Agents Working' : 'Standby'}
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

        {/* Docked bottom-centre of the hero, under the orb. */}
        <div className="face-voicebar">
          <FaceVoicePanel
            listening={voice.listening}
            pending={commands.pending}
            elapsed={commands.elapsed}
            levels={voice.levels}
            interim={voice.interim}
            heard={commands.heard}
            reply={commands.reply}
            hint={commands.hint}
            speechSupported={voice.speechSupported}
            micError={voice.micError}
            muted={muted}
            onToggleMute={toggleMute}
            reducedMotion={reducedMotion}
            onHoldStart={voice.start}
            onHoldEnd={voice.stop}
            onSubmit={commands.run}
          />
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
        {commands.panel === 'modules' ? (
          <FaceModuleList
            live={summary?.modules.live ?? []}
            planned={summary?.modules.planned ?? []}
            readable={summary ? summary.modules.readable : true}
            loading={loading}
          />
        ) : (
          <FaceCommandPanel
            panel={commands.panel}
            plan={commands.plan}
            needsMe={commands.needsMe}
            onBack={commands.back}
          />
        )}

        <FaceActivityTrail
          items={activity?.trail.items ?? []}
          readable={activity ? activity.trail.readable : true}
          loading={activityLoading}
        />
      </div>
    </section>
  );
}

export default FaceHero;
