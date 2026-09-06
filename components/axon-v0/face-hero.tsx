'use client';

/**
 * THE FACE — brain-orb hero (Build Plan B, step 1).
 *
 * Spec: docs/the-face/SPEC.md. This is the Dash home screen, not a tab: `app/(axon-v0)/page.tsx`
 * renders it at `/`, and the old home deck moved to `/deck` until step 2 folds its cards
 * around the orb. This component is the hero only — the orb, the corner reticles and the
 * state readout. Stat cards, the module list and the voice bar are steps 2 and 3.
 *
 * The pulse is driven by a mock signal for now (see lib/axon-v0/use-agent-working.ts).
 * Add `?working=1` to pin it working, `?working=0` to pin it resting.
 */
import Link from 'next/link';
import FaceOrbScene from '@/components/axon-v0/face-orb-scene';
import { useAgentWorkingSignal, usePrefersReducedMotion } from '@/lib/axon-v0/use-agent-working';
import '@/components/axon-v0/face.css';

export function FaceHero() {
  const { working, source } = useAgentWorkingSignal();
  const reducedMotion = usePrefersReducedMotion();

  const stateLabel = working ? 'Agents working' : 'Standby';
  const sentence = working
    ? 'Agents are working right now. The orb beats while they run.'
    : 'Nothing is running. The orb rests until an agent starts work.';

  return (
    <section className="face-hero" aria-labelledby="face-heading">
      <h1 id="face-heading" className="sr-only">
        AXON mission control
      </h1>

      <span className="face-reticle face-reticle--tl" aria-hidden />
      <span className="face-reticle face-reticle--tr" aria-hidden />
      <span className="face-reticle face-reticle--bl" aria-hidden />
      <span className="face-reticle face-reticle--br" aria-hidden />

      <div className="face-topbar">
        <span className="face-micro">AXON</span>
        <span className="face-micro">Mission Control</span>
        <span className="face-micro">Preview</span>
      </div>

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
            ? 'State is pinned by the address bar. Remove it from the address to let the orb swing on its own.'
            : 'Test signal for now. Real agent activity drives this later.'}
          {reducedMotion ? ' Motion is reduced, so the orb is holding still.' : ''}
        </p>
      </div>

      {/* The one way out of the hero until step 2 folds the deck's cards around the orb. */}
      <div className="face-footbar">
        <Link href="/deck" className="face-micro face-deck-link">
          Open Deck
        </Link>
      </div>
    </section>
  );
}

export default FaceHero;
