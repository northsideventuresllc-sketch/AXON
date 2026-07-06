'use client';

import {
  AXON_ORB_STATUS,
  resolveAxonOrbState,
} from '@/lib/axon-orb-theme';

interface AxonOrbStatusProps {
  active: boolean;
  listening?: boolean;
  speaking?: boolean;
  processing?: boolean;
}

export function AxonOrbStatus({
  active,
  listening,
  speaking,
  processing,
}: AxonOrbStatusProps) {
  const state = resolveAxonOrbState(active, listening, speaking, processing);
  const status = AXON_ORB_STATUS[state];

  return (
    <div
      className="axon-orb-status-pill flex items-center gap-2 rounded-full border border-white/8 bg-black/35 px-2.5 py-1 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label={`AXON status: ${status.label}`}
    >
      <span
        className={`axon-orb-status-dot ${status.dotClass} ${
          status.pulseFast ? 'axon-orb-status-dot--fast' : ''
        }`}
        aria-hidden
      />
      <span className="axon-orb-status-text">{status.label}</span>
    </div>
  );
}
