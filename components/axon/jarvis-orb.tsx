'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createOrbEngine, type OrbState } from '@/lib/jarvis-orb-engine';

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
): OrbState {
  if (processing) return 'processing';
  if (listening) return 'listening';
  if (speaking) return 'speaking';
  if (active) return 'online';
  return 'standby';
}

function statusLabel(state: OrbState): string {
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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function JarvisOrb({
  active,
  listening,
  speaking,
  processing,
  size = 'large',
}: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReturnType<typeof createOrbEngine> | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.42, hover: 0 });
  const hoverTarget = useRef(0);
  const rafRef = useRef<number>(0);
  const pausedRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dims, setDims] = useState({ px: size === 'large' ? 280 : 220, dpr: 1 });

  const state = resolveState(active, listening, speaking, processing);
  const label = statusLabel(state);
  const isLive = state !== 'standby';

  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = Math.max(Math.round(rect.width), size === 'large' ? 260 : 200);
    setDims({ px, dpr: Math.min(window.devicePixelRatio || 1, 2) });
  }, [size]);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (rootRef.current) ro.observe(rootRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  useEffect(() => {
    if (!engineRef.current) {
      engineRef.current = createOrbEngine(state);
    }
    engineRef.current.setState(state);
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    canvas.width = dims.px * dims.dpr;
    canvas.height = dims.px * dims.dpr;

    const tick = (time: number) => {
      const engine = engineRef.current;
      if (!pausedRef.current && engine) {
        const ptr = pointerRef.current;
        ptr.hover += (hoverTarget.current - ptr.hover) * 0.12;
        engine.setPointer(ptr.x, ptr.y, ptr.hover);
        engine.draw(ctx, dims.px, dims.dpr, time);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dims, reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        pausedRef.current = !entries.some((e) => e.isIntersecting);
      },
      { threshold: 0.05 }
    );
    io.observe(root);

    const onVis = () => {
      pausedRef.current = document.hidden;
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    pointerRef.current.x = (e.clientX - rect.left) / rect.width;
    pointerRef.current.y = (e.clientY - rect.top) / rect.height;
  }

  function handlePointerEnter() {
    setHovered(true);
    hoverTarget.current = 1;
  }

  function handlePointerLeave() {
    setHovered(false);
    hoverTarget.current = 0;
    pointerRef.current.x = 0.5;
    pointerRef.current.y = 0.42;
  }

  return (
    <div
      ref={rootRef}
      className={`axon-orb-root group relative mx-auto aspect-square w-full max-w-[280px] cursor-pointer select-none touch-none ${
        size === 'large' ? 'max-w-[300px] sm:max-w-[320px]' : 'max-w-[220px]'
      } ${hovered ? 'axon-orb-hovered' : ''} ${processing ? 'axon-orb-processing-state' : ''}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      role="img"
      aria-label={`AXON — ${label}`}
    >
      {reducedMotion ? (
        <div className="axon-orb-static-fallback flex h-full w-full items-center justify-center">
          <div className="axon-orb-static-core h-[62%] w-[62%] rounded-full" />
        </div>
      ) : (
        <canvas ref={canvasRef} className="block h-full w-full" />
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={`axon-orb-title ${hovered ? 'axon-orb-title-active' : ''}`}>AXON</span>

        <div className="axon-orb-status mt-2 flex items-center gap-2">
          {isLive && (
            <span
              className={`axon-orb-pulse-dot ${state === 'processing' ? 'axon-orb-pulse-dot-fast' : ''}`}
              aria-hidden
            />
          )}
          <span
            className={`axon-orb-status-text ${hovered ? 'axon-orb-status-text-active' : ''}`}
          >
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
