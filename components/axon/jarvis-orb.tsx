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

function statusLabel(state: AxonOrbVisualState): string {
  switch (state) {
    case 'processing':
      return 'Thinking…';
    case 'listening':
      return 'Listening';
    case 'speaking':
      return 'Speaking';
    case 'online':
      return 'Ready';
    default:
      return 'At rest';
  }
}

export function JarvisOrb({
  active,
  listening,
  speaking,
  processing,
  size = 'large',
}: JarvisOrbProps) {
  const state = resolveState(active, listening, speaking, processing);
  const label = statusLabel(state);
  const isLive = state !== 'standby';

  const orbState = useMemo(() => AXON_ORB_STATES[state], [state]);

  return (
    <div
      className={`axon-orb-root group relative mx-auto aspect-square w-full select-none touch-none ${
        size === 'large' ? 'max-w-[300px] sm:max-w-[340px]' : 'max-w-[220px]'
      } ${isLive ? 'axon-orb-live' : ''} ${processing ? 'axon-orb-processing-state' : ''}`}
      role="img"
      aria-label={`AXON — ${label}`}
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
          ariaLabel={`AXON orb — ${label}`}
          className="axon-orb-webgl"
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
        <span className={`axon-orb-title ${isLive ? 'axon-orb-title-active' : ''}`}>AXON</span>

        <div className="axon-orb-status mt-2 flex items-center gap-2">
          {isLive && (
            <span
              className={`axon-orb-pulse-dot ${state === 'processing' ? 'axon-orb-pulse-dot-fast' : ''}`}
              aria-hidden
            />
          )}
          <span className={`axon-orb-status-text ${isLive ? 'axon-orb-status-text-active' : ''}`}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
