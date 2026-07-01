'use client';

import { useEffect, useState } from 'react';

interface JarvisOrbProps {
  active: boolean;
  listening?: boolean;
  speaking?: boolean;
}

export function JarvisOrb({ active, listening, speaking }: JarvisOrbProps) {
  const [pulse, setPulse] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setPulse((p) => p + 1), 120);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 3;
      setTilt({
        x: (e.clientY - cy) / 80,
        y: (e.clientX - cx) / 80,
      });
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const ringClass = listening
    ? 'border-axon-teal shadow-[0_0_80px_rgba(94,234,212,0.35)]'
    : speaking
      ? 'border-axon-gold shadow-[0_0_80px_rgba(201,169,98,0.35)]'
      : active
        ? 'border-axon-purple-glow/70 shadow-[0_0_60px_rgba(155,127,212,0.25)]'
        : 'border-axon-border';

  const scale = 1 + Math.sin(pulse * 0.15) * 0.04;

  return (
    <div
      className="relative flex items-center justify-center perspective-[800px]"
      style={{
        transform: `rotateX(${-tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      {/* Orbital rings */}
      <div
        className={`absolute h-52 w-52 rounded-full border border-axon-purple/20 transition-all duration-700 ${active ? 'animate-drift opacity-30' : 'opacity-10'}`}
        style={{ transform: `scale(${scale * 1.08}) rotate(${pulse * 0.5}deg)` }}
      />
      <div
        className={`absolute h-44 w-44 rounded-full border transition-all duration-700 ${ringClass} ${active ? 'opacity-50' : 'opacity-20'}`}
        style={{ transform: `scale(${scale}) rotate(${-pulse * 0.3}deg)` }}
      />
      <div
        className={`absolute h-36 w-36 rounded-full border border-axon-purple-glow/25 transition-all duration-500 ${listening ? 'border-axon-teal/50' : ''}`}
        style={{ transform: `scale(${1 + Math.sin(pulse * 0.2 + 1) * 0.06})` }}
      />

      {/* Core orb */}
      <div
        className={`relative flex h-32 w-32 items-center justify-center rounded-full border-2 bg-gradient-to-br from-axon-violet via-axon-purple-deep to-axon-bg ${ringClass} animate-float`}
        style={{
          boxShadow: active
            ? 'inset 0 -8px 24px rgba(61,42,122,0.6), inset 0 8px 16px rgba(155,127,212,0.15)'
            : undefined,
        }}
      >
        <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-axon-purple-glow/20 via-transparent to-axon-gold/10" />
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background:
                'linear-gradient(105deg, transparent 40%, rgba(155,127,212,0.25) 50%, transparent 60%)',
              backgroundSize: '200% 100%',
              animation: active ? 'shimmer 4s linear infinite' : undefined,
            }}
          />
        </div>

        <div className="relative text-center">
          <span className="block text-xs uppercase tracking-[0.35em] text-axon-purple-glow">AXON</span>
          <span className="mt-1 block font-mono text-[10px] text-axon-muted">
            {listening ? 'listening' : speaking ? 'speaking' : active ? 'online' : 'standby'}
          </span>
        </div>

        {active && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div className="absolute h-px w-full animate-[scan_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-axon-purple-glow/60 to-transparent" />
          </div>
        )}
      </div>

      {/* Ground glow */}
      <div
        className="absolute -bottom-6 h-8 w-28 rounded-full blur-xl transition-opacity"
        style={{
          background: 'radial-gradient(ellipse, rgba(107,76,154,0.4) 0%, transparent 70%)',
          opacity: active ? 0.8 : 0.3,
        }}
      />
    </div>
  );
}
