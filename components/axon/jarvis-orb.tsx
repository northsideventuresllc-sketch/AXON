'use client';

import { useEffect, useState } from 'react';

interface JarvisOrbProps {
  active: boolean;
  listening?: boolean;
  speaking?: boolean;
}

export function JarvisOrb({ active, listening, speaking }: JarvisOrbProps) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setPulse((p) => p + 1), 120);
    return () => clearInterval(id);
  }, [active]);

  const ringClass = listening
    ? 'border-axon-teal shadow-[0_0_60px_rgba(61,214,197,0.35)]'
    : speaking
      ? 'border-axon-gold shadow-[0_0_60px_rgba(201,169,98,0.35)]'
      : active
        ? 'border-axon-gold/60 shadow-[0_0_40px_rgba(201,169,98,0.15)]'
        : 'border-axon-border';

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer rings */}
      <div
        className={`absolute h-48 w-48 rounded-full border transition-all duration-700 ${ringClass} ${active ? 'animate-pulse opacity-40' : 'opacity-20'}`}
        style={{ transform: `scale(${1 + Math.sin(pulse * 0.15) * 0.04})` }}
      />
      <div
        className={`absolute h-36 w-36 rounded-full border border-axon-gold/20 transition-all duration-500 ${listening ? 'border-axon-teal/40' : ''}`}
        style={{ transform: `scale(${1 + Math.sin(pulse * 0.2 + 1) * 0.06})` }}
      />

      {/* Core orb */}
      <div
        className={`relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-axon-elevated via-axon-surface to-axon-bg border-2 ${ringClass}`}
      >
        <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-axon-gold/10 to-transparent" />
        <div className="relative text-center">
          <span className="block text-xs uppercase tracking-[0.35em] text-axon-gold">AXON</span>
          <span className="mt-1 block font-mono text-[10px] text-axon-muted">
            {listening ? 'listening' : speaking ? 'speaking' : active ? 'online' : 'standby'}
          </span>
        </div>

        {/* Scan line */}
        {active && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div className="absolute h-px w-full animate-[scan_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-axon-gold/50 to-transparent" />
          </div>
        )}
      </div>
    </div>
  );
}
