'use client';

import { JarvisOrb as JarvisOrbWebGL } from 'jarvis-ai-web-animation';
import { useMemo } from 'react';
import {
  AXON_ORB_PALETTE,
  AXON_ORB_STATES,
  AXON_ORB_STATUS,
  resolveAxonOrbState,
} from '@/lib/axon-orb-theme';

interface JarvisOrbProps {
  active: boolean;
  listening?: boolean;
  speaking?: boolean;
  processing?: boolean;
  size?: 'default' | 'large';
  /** When true, orb accepts pointer input (voice mode). */
  interactive?: boolean;
  onActivate?: () => void;
}

export function JarvisOrb({
  active,
  listening,
  speaking,
  processing,
  size = 'large',
  interactive = false,
  onActivate,
}: JarvisOrbProps) {
  const state = resolveAxonOrbState(active, listening, speaking, processing);
  const status = AXON_ORB_STATUS[state];
  const isLive = state !== 'standby';
  const orbState = useMemo(() => AXON_ORB_STATES[state], [state]);

  return (
    <div
      className={`axon-orb-stack mx-auto w-full select-none ${
        interactive ? 'touch-none' : 'pointer-events-none'
      } ${size === 'large' ? 'max-w-[300px] sm:max-w-[360px]' : 'max-w-[240px]'}`}
    >
      <div
        className={`axon-orb-root relative aspect-square w-full ${
          isLive ? 'axon-orb-live' : ''
        } ${processing ? 'axon-orb-processing-state' : ''}`}
        role="img"
        aria-label={`AXON — ${status.label}`}
      >
        <div className="axon-orb-canvas absolute inset-0">
          <JarvisOrbWebGL
            size="panel"
            state={orbState}
            palette={AXON_ORB_PALETTE}
            quality="high"
            breathing
            breathingIntensity={0.85}
            interactive={interactive}
            onPointerPulse={onActivate}
            ariaLabel={`AXON orb — ${status.label}`}
            className="axon-orb-webgl"
          />
        </div>
      </div>

      <div className="axon-orb-brand pointer-events-none mt-3 text-center sm:mt-4">
        <div className="axon-orb-brand-rule mx-auto mb-2 h-px w-16 bg-gradient-to-r from-transparent via-axon-blue/50 to-transparent" />
        <h2 className={`axon-orb-wordmark ${isLive ? 'axon-orb-wordmark-live' : ''}`} aria-hidden>
          {'AXON'.split('').map((letter, i) => (
            <span
              key={letter + i}
              className="axon-orb-wordmark-letter"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {letter}
            </span>
          ))}
        </h2>
        <p className="axon-orb-tagline mt-1.5">Autonomous Intelligence Core</p>
      </div>
    </div>
  );
}
