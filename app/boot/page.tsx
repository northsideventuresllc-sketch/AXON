'use client';

import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import {
  AxonBootComposition,
  BOOT_DURATION_IN_FRAMES,
  BOOT_FPS,
} from '@/components/axon-v0/remotion/axon-boot';
import { speak } from '@/components/axon-v0/voice';

export default function BootPage() {
  const playerRef = useRef<PlayerRef>(null);
  const [mounted, setMounted] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    speak('Welcome.');
    // Hard nav to the command deck — reliable on mobile even if the player janks.
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    window.location.assign(base || '/');
  };

  useEffect(() => {
    setMounted(true);
    // Reduced motion: skip the cinematic, land on the deck almost immediately.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const t = setTimeout(finish, 400);
      return () => clearTimeout(t);
    }
    // Safety net: if the player never fires its end event, move on anyway.
    const fallback = setTimeout(finish, (BOOT_DURATION_IN_FRAMES / BOOT_FPS) * 1000 + 1500);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const player = playerRef.current;
    if (!player) return;
    const onEnded = () => finish();
    player.addEventListener('ended', onEnded);
    return () => player.removeEventListener('ended', onEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  return (
    <div className="fixed inset-0 z-50 bg-[#07080C]">
      {mounted && (
        <Player
          ref={playerRef}
          component={AxonBootComposition}
          durationInFrames={BOOT_DURATION_IN_FRAMES}
          compositionWidth={1280}
          compositionHeight={720}
          fps={BOOT_FPS}
          autoPlay
          initiallyMuted
          clickToPlay={false}
          style={{ width: '100%', height: '100%' }}
        />
      )}
      <button
        onClick={finish}
        className="absolute bottom-5 right-6 z-10 font-mono text-[11px] uppercase tracking-[0.3em] text-slate-500 transition hover:text-cyan-300 focus-visible:text-cyan-300"
      >
        skip ⏭
      </button>
    </div>
  );
}
