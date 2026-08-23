'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/components/axon-v0/voice';

const BOOT_LINES = [
  'NORTHSiDE KERNEL … LINK ESTABLISHED',
  'NEURAL LATTICE … ONLINE',
  'TIER CHAIN … ARMED',
  'VENTURE GRID … SYNCED',
  'OPERATOR PROFILE … JB',
];

export default function BootPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'build' | 'neon' | 'dash'>('build');
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    let i = 0;
    const lineTimer = setInterval(() => {
      setLines((prev) => [...prev, BOOT_LINES[i]]);
      i += 1;
      if (i >= BOOT_LINES.length) clearInterval(lineTimer);
    }, 420);
    const toNeon = setTimeout(() => setPhase('neon'), 2600);
    const toDash = setTimeout(() => {
      setPhase('dash');
      speak('Welcome.');
    }, 5200);
    const go = setTimeout(() => router.push('/'), 6400);
    return () => {
      clearInterval(lineTimer);
      clearTimeout(toNeon);
      clearTimeout(toDash);
      clearTimeout(go);
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080C] text-slate-100">
      <div className="v0-wave-layer" />
      {phase === 'build' && (
        <div className="relative z-10 w-full max-w-md px-6">
          <div className="v0-ring mx-auto h-28 w-28 rounded-full border border-dashed border-cyan-400/40" />
          <div className="mt-8 space-y-1.5 font-mono text-xs text-cyan-300/80">
            {lines.map((l, i) => (
              <p key={i} className="v0-rise">▸ {l}</p>
            ))}
          </div>
        </div>
      )}
      {phase !== 'build' && (
        <div className="relative z-10 text-center">
          <h1 className="v0-neon text-6xl sm:text-7xl">AXON</h1>
          <p className="mt-4 text-[11px] uppercase tracking-[0.5em] text-slate-400">
            Northside Intelligence
          </p>
          {phase === 'dash' && (
            <p className="v0-rise mt-8 text-sm text-cyan-200/80">Bringing up your command deck…</p>
          )}
        </div>
      )}
    </div>
  );
}
