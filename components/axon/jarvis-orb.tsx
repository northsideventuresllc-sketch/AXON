'use client';

import { JarvisOrb as JarvisOrbWebGL } from 'jarvis-ai-web-animation';
import { useMemo } from 'react';
import {
  AXON_ORB_PALETTE,
  AXON_ORB_STATES,
  type AxonOrbVisualState,
} from '@/lib/axon-orb-theme';

interface JarvisOrbProps {
  active: boolean;
  listening?: boolean;
  speaking?: boolean;
  processing?: boolean;
  size?: 'default' | 'large';
}

interface StatusMeta {
  label: string;
  dotClass: string;
  pulseFast?: boolean;
}

const STATUS_META: Record<AxonOrbVisualState, StatusMeta> = {
  standby: { label: 'Idle', dotClass: 'axon-orb-status-dot--idle' },
  online: { label: 'Active', dotClass: 'axon-orb-status-dot--active' },
  listening: { label: 'Listening', dotClass: 'axon-orb-status-dot--listening' },
  speaking: { label: 'Speaking', dotClass: 'axon-orb-status-dot--speaking' },
  processing: { label: 'Thinking', dotClass: 'axon-orb-status-dot--thinking', pulseFast: true },
};

function resolveState(
  active: boolean,
  listening?: boolean,
  speaking?: boolean,
  processing?: boolean
): AxonOrbVisualState {
  if (processing) return 'processing';
  if (listening) return 'listening';
  if (speaking) return 'speaking';
  if (active) return 'online';
  return 'standby';
}

export function JarvisOrb({
  active,
  listening,
  speaking,
  processing,
  size = 'large',
}: JarvisOrbProps) {
  const state = resolveState(active, listening, speaking, processing);
  const status = STATUS_META[state];
  const isLive = state !== 'standby';
  const orbState = useMemo(() => AXON_ORB_STATES[state], [state]);

  return (
    <div
      className={`axon-orb-stack mx-auto w-full select-none touch-none ${
        size === 'large' ? 'max-w-[300px] sm:max-w-[360px]' : 'max-w-[240px]'
      }`}
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
            interactive
            ariaLabel={`AXON orb — ${status.label}`}
            className="axon-orb-webgl"
          />
        </div>

        <div className="axon-orb-status-corner pointer-events-none absolute bottom-2 left-1 z-10 sm:bottom-3 sm:left-2">
          <div className="axon-orb-status-pill flex items-center gap-2 rounded-full border border-white/8 bg-black/35 px-2.5 py-1 backdrop-blur-md">
            <span
              className={`axon-orb-status-dot ${status.dotClass} ${
                status.pulseFast ? 'axon-orb-status-dot--fast' : ''
              }`}
              aria-hidden
            />
            <span className="axon-orb-status-text">{status.label}</span>
          </div>
        </div>
      </div>

      <div className="axon-orb-brand pointer-events-none mt-3 text-center sm:mt-4">
        <div className="axon-orb-brand-rule mx-auto mb-2 h-px w-16 bg-gradient-to-r from-transparent via-axon-blue/50 to-transparent" />
        <h2 className={`axon-orb-wordmark ${isLive ? 'axon-orb-wordmark-live' : ''}`} aria-hidden>
          {'AXON'.split('').map((letter, i) => (
            <span key={letter + i} className="axon-orb-wordmark-letter" style={{ animationDelay: `${i * 0.12}s` }}>
              {letter}
            </span>
          ))}
        </h2>
        <p className="axon-orb-tagline mt-1.5">Autonomous Intelligence Core</p>
      </div>
    </div>
  );
}
