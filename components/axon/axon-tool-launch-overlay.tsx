'use client';

import { useEffect, useState } from 'react';

interface AxonToolLaunchOverlayProps {
  toolName: string;
  icon?: string;
  onComplete: () => void;
}

/** Full branded transition when entering an AXON tool from the sidebar. */
export function AxonToolLaunchOverlay({ toolName, icon = '◎', onComplete }: AxonToolLaunchOverlayProps) {
  const [phase, setPhase] = useState<'pulse' | 'reveal' | 'exit'>('pulse');

  useEffect(() => {
    const reveal = window.setTimeout(() => setPhase('reveal'), 420);
    const exit = window.setTimeout(() => setPhase('exit'), 1180);
    const done = window.setTimeout(onComplete, 1580);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(exit);
      window.clearTimeout(done);
    };
  }, [onComplete]);

  return (
    <div
      className={`axon-tool-launch-overlay ${phase === 'exit' ? 'axon-tool-launch-overlay--exit' : ''}`}
      aria-hidden
    >
      <div className="axon-tool-launch-overlay__glow" />
      <div className="axon-tool-launch-overlay__ring" />
      <div className="axon-tool-launch-overlay__content">
        <span className="axon-tool-launch-overlay__brand">AXON</span>
        <span className="axon-tool-launch-overlay__icon">{icon}</span>
        <p className="axon-tool-launch-overlay__label">Launching</p>
        <h2 className="axon-tool-launch-overlay__name">{toolName}</h2>
      </div>
    </div>
  );
}
