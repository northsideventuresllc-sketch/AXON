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
        x: (e.clientY - cy) / 70,
        y: (e.clientX - cx) / 70,
      });
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const ringClass = listening
    ? 'border-axon-cyan shadow-[0_0_90px_rgba(34,211,238,0.4)]'
    : speaking
      ? 'border-axon-blue-glow shadow-[0_0_90px_rgba(96,165,250,0.4)]'
      : active
        ? 'border-axon-blue-bright/80 shadow-[0_0_70px_rgba(59,130,246,0.3)]'
        : 'border-axon-border';

  const scale = 1 + Math.sin(pulse * 0.15) * 0.05;

  return (
    <div
      className="relative flex items-center justify-center perspective-[900px]"
      style={{
        transform: `rotateX(${-tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      <div
        className={`absolute h-56 w-56 rounded-full border border-axon-blue/25 transition-all duration-700 ${active ? 'animate-drift opacity-35' : 'opacity-10'}`}
        style={{ transform: `scale(${scale * 1.1}) rotate(${pulse * 0.5}deg)` }}
      />
      <div
        className={`absolute h-48 w-48 rounded-full border transition-all duration-700 ${ringClass} ${active ? 'opacity-55' : 'opacity-20'}`}
        style={{ transform: `scale(${scale}) rotate(${-pulse * 0.3}deg)` }}
      />
      <div
        className={`absolute h-40 w-40 rounded-full border border-axon-purple-glow/30 transition-all duration-500 ${listening ? 'border-axon-cyan/60' : ''}`}
        style={{ transform: `scale(${1 + Math.sin(pulse * 0.2 + 1) * 0.07})` }}
      />

      <div
        className={`relative flex h-36 w-36 items-center justify-center rounded-full border-2 bg-gradient-to-br from-axon-blue via-axon-violet to-axon-purple-deep ${ringClass} animate-float`}
        style={{
          boxShadow: active
            ? 'inset 0 -10px 28px rgba(37,99,235,0.55), inset 0 10px 20px rgba(34,211,238,0.12), 0 0 40px rgba(99,102,241,0.25)'
            : undefined,
        }}
      >
        <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-axon-cyan/25 via-transparent to-axon-purple-glow/20" />
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute inset-0 opacity-45"
            style={{
              background:
                'linear-gradient(105deg, transparent 35%, rgba(96,165,250,0.35) 50%, rgba(129,140,248,0.2) 55%, transparent 65%)',
              backgroundSize: '200% 100%',
              animation: active ? 'shimmer 3.5s linear infinite' : undefined,
            }}
          />
        </div>

        <div className="relative text-center">
          <span className="block text-xs uppercase tracking-[0.35em] text-axon-cyan">AXON</span>
          <span className="mt-1 block font-mono text-[10px] text-axon-muted">
            {listening ? 'listening' : speaking ? 'speaking' : active ? 'online' : 'standby'}
          </span>
        </div>

        {active && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div className="absolute h-px w-full animate-[scan_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-axon-cyan/70 to-transparent" />
          </div>
        )}
      </div>

      <div
        className="absolute -bottom-8 h-10 w-36 rounded-full blur-xl transition-opacity"
        style={{
          background:
            'radial-gradient(ellipse, rgba(37,99,235,0.45) 0%, rgba(99,102,241,0.25) 50%, transparent 75%)',
          opacity: active ? 0.9 : 0.35,
        }}
      />
    </div>
  );
}
