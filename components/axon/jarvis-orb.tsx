'use client';

import { useEffect, useState } from 'react';

interface JarvisOrbProps {
  active: boolean;
  listening?: boolean;
  speaking?: boolean;
  processing?: boolean;
  size?: 'default' | 'large';
}

export function JarvisOrb({
  active,
  listening,
  speaking,
  processing,
  size = 'large',
}: JarvisOrbProps) {
  const [pulse, setPulse] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    const interval = processing ? 60 : 120;
    const id = setInterval(() => setPulse((p) => p + 1), interval);
    return () => clearInterval(id);
  }, [active, processing]);

  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => setSpin((s) => s + 6), 50);
    return () => clearInterval(id);
  }, [processing]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      setTilt({
        x: (e.clientY - cy) / 90,
        y: (e.clientX - cx) / 90,
      });
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const ringClass = processing
    ? 'border-axon-cyan shadow-[0_0_100px_rgba(34,211,238,0.5)] axon-orb-processing'
    : listening
      ? 'border-axon-cyan shadow-[0_0_90px_rgba(34,211,238,0.4)]'
      : speaking
        ? 'border-axon-blue-glow shadow-[0_0_90px_rgba(96,165,250,0.4)]'
        : active
          ? 'border-axon-blue-bright/80 shadow-[0_0_70px_rgba(59,130,246,0.3)]'
          : 'border-axon-border';

  const scale = 1 + Math.sin(pulse * (processing ? 0.25 : 0.15)) * (processing ? 0.08 : 0.05);
  const large = size === 'large';

  return (
    <div
      className={`relative flex items-center justify-center perspective-[900px] ${large ? 'scale-100 sm:scale-105' : ''}`}
      style={{
        transform: `rotateX(${-tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
    >
      {processing && (
        <>
          <div
            className="absolute rounded-full border-2 border-dashed border-axon-cyan/50 axon-orb-spin-ring"
            style={{
              width: large ? 280 : 220,
              height: large ? 280 : 220,
              transform: `rotate(${spin}deg)`,
            }}
          />
          <div
            className="absolute rounded-full border border-axon-blue-glow/40"
            style={{
              width: large ? 260 : 200,
              height: large ? 260 : 200,
              transform: `rotate(${-spin * 1.4}deg) scale(${1 + Math.sin(pulse * 0.3) * 0.05})`,
            }}
          />
        </>
      )}

      <div
        className={`absolute rounded-full border border-axon-blue/25 transition-all duration-700 ${
          active || processing ? 'animate-drift opacity-35' : 'opacity-10'
        } ${large ? 'h-64 w-64' : 'h-56 w-56'}`}
        style={{ transform: `scale(${scale * 1.1}) rotate(${pulse * 0.5}deg)` }}
      />
      <div
        className={`absolute rounded-full border transition-all duration-700 ${ringClass} ${
          active || processing ? 'opacity-55' : 'opacity-20'
        } ${large ? 'h-56 w-56' : 'h-48 w-48'}`}
        style={{ transform: `scale(${scale}) rotate(${-pulse * 0.3}deg)` }}
      />
      <div
        className={`absolute rounded-full border border-axon-purple-glow/30 transition-all duration-500 ${
          listening || processing ? 'border-axon-cyan/60' : ''
        } ${large ? 'h-48 w-48' : 'h-40 w-40'}`}
        style={{ transform: `scale(${1 + Math.sin(pulse * 0.2 + 1) * 0.07})` }}
      />

      <div
        className={`relative flex items-center justify-center rounded-full border-2 bg-gradient-to-br from-axon-blue via-axon-violet to-axon-purple-deep ${ringClass} ${
          processing ? '' : 'animate-float'
        } ${large ? 'h-44 w-44' : 'h-36 w-36'}`}
        style={{
          boxShadow:
            active || processing
              ? 'inset 0 -10px 28px rgba(37,99,235,0.55), inset 0 10px 20px rgba(34,211,238,0.12), 0 0 40px rgba(99,102,241,0.25)'
              : undefined,
        }}
      >
        <div className="absolute inset-3 rounded-full bg-gradient-to-tr from-axon-cyan/25 via-transparent to-axon-purple-glow/20" />
        {processing && (
          <div className="absolute inset-0 overflow-hidden rounded-full">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="absolute h-full w-full rounded-full border border-axon-cyan/20"
                style={{
                  animation: `axon-orb-pulse-ring 1.5s ease-out infinite ${i * 0.5}s`,
                }}
              />
            ))}
          </div>
        )}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute inset-0 opacity-45"
            style={{
              background:
                'linear-gradient(105deg, transparent 35%, rgba(96,165,250,0.35) 50%, rgba(129,140,248,0.2) 55%, transparent 65%)',
              backgroundSize: '200% 100%',
              animation: active || processing ? 'shimmer 2s linear infinite' : undefined,
            }}
          />
        </div>

        <div className="relative text-center">
          <span className="block text-xs uppercase tracking-[0.35em] text-axon-cyan">AXON</span>
          <span className="mt-1 block font-mono text-[10px] text-axon-muted">
            {processing
              ? 'processing…'
              : listening
                ? 'listening'
                : speaking
                  ? 'speaking'
                  : active
                    ? 'online'
                    : 'standby'}
          </span>
        </div>

        {(active || processing) && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <div
              className={`absolute h-px w-full bg-gradient-to-r from-transparent via-axon-cyan/70 to-transparent ${
                processing ? 'animate-[scan_1.2s_ease-in-out_infinite]' : 'animate-[scan_3s_ease-in-out_infinite]'
              }`}
            />
          </div>
        )}
      </div>

      <div
        className={`absolute rounded-full blur-xl transition-opacity ${large ? '-bottom-10 h-12 w-44' : '-bottom-8 h-10 w-36'}`}
        style={{
          background:
            'radial-gradient(ellipse, rgba(37,99,235,0.45) 0%, rgba(99,102,241,0.25) 50%, transparent 75%)',
          opacity: active || processing ? 0.95 : 0.35,
        }}
      />
    </div>
  );
}
