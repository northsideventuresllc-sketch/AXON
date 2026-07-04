'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface JarvisOrbProps {
  active: boolean;
  listening?: boolean;
  speaking?: boolean;
  processing?: boolean;
  size?: 'default' | 'large';
}

type OrbState = 'standby' | 'online' | 'listening' | 'speaking' | 'processing';

interface Palette {
  core: string;
  mid: string;
  deep: string;
  rim: string;
  specular: string;
  aura: string;
  auraSecondary: string;
}

const PALETTES: Record<OrbState, Palette> = {
  standby: {
    core: 'rgba(186, 230, 253, 0.55)',
    mid: 'rgba(37, 99, 235, 0.92)',
    deep: 'rgba(8, 18, 38, 0.98)',
    rim: 'rgba(96, 165, 250, 0.35)',
    specular: 'rgba(224, 242, 254, 0.9)',
    aura: '59, 130, 246',
    auraSecondary: '99, 102, 241',
  },
  online: {
    core: 'rgba(165, 243, 252, 0.72)',
    mid: 'rgba(59, 130, 246, 0.95)',
    deep: 'rgba(10, 22, 45, 0.98)',
    rim: 'rgba(34, 211, 238, 0.42)',
    specular: 'rgba(255, 255, 255, 0.92)',
    aura: '59, 130, 246',
    auraSecondary: '34, 211, 238',
  },
  listening: {
    core: 'rgba(103, 232, 249, 0.85)',
    mid: 'rgba(34, 211, 238, 0.95)',
    deep: 'rgba(6, 24, 40, 0.98)',
    rim: 'rgba(45, 212, 191, 0.5)',
    specular: 'rgba(236, 254, 255, 0.95)',
    aura: '34, 211, 238',
    auraSecondary: '45, 212, 191',
  },
  speaking: {
    core: 'rgba(191, 219, 254, 0.8)',
    mid: 'rgba(96, 165, 250, 0.95)',
    deep: 'rgba(12, 20, 42, 0.98)',
    rim: 'rgba(129, 140, 248, 0.48)',
    specular: 'rgba(248, 250, 252, 0.9)',
    aura: '96, 165, 250',
    auraSecondary: '129, 140, 248',
  },
  processing: {
    core: 'rgba(224, 242, 254, 0.9)',
    mid: 'rgba(34, 211, 238, 0.98)',
    deep: 'rgba(5, 16, 36, 0.98)',
    rim: 'rgba(99, 102, 241, 0.55)',
    specular: 'rgba(255, 255, 255, 0.98)',
    aura: '34, 211, 238',
    auraSecondary: '99, 102, 241',
  },
};

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

/** Draw a soft circular bloom — never uses fillRect to avoid square artifacts */
function drawCircularBloom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  innerAlpha: number,
  rgb: string,
  blur = 0
) {
  ctx.save();
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  const g = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
  g.addColorStop(0, `rgba(${rgb}, ${innerAlpha})`);
  g.addColorStop(0.45, `rgba(${rgb}, ${innerAlpha * 0.35})`);
  g.addColorStop(0.78, `rgba(${rgb}, ${innerAlpha * 0.08})`);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOrbFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  dpr: number,
  time: number,
  pointer: { x: number; y: number; hover: number },
  state: OrbState
) {
  const w = size * dpr;
  const h = size * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const radius = size * 0.36 * dpr;
  const palette = PALETTES[state];

  const breathe = 1 + Math.sin(time * 0.0018) * (state === 'processing' ? 0.018 : 0.01);
  const r = radius * breathe * (1 + pointer.hover * 0.035);

  const tiltX = (pointer.x - 0.5) * 0.22 * pointer.hover;
  const tiltY = (pointer.y - 0.5) * 0.22 * pointer.hover;

  const lightX = cx + (-0.28 + tiltX + (pointer.x - 0.5) * 0.35 * pointer.hover) * r;
  const lightY = cy + (-0.32 + tiltY + (pointer.y - 0.5) * 0.35 * pointer.hover) * r;

  const activity =
    state === 'processing' ? 1 : state === 'listening' ? 0.75 : state === 'speaking' ? 0.6 : 0.35;

  const hoverBoost = pointer.hover * 0.22;
  const pulse = 0.5 + Math.sin(time * 0.0022) * 0.5;

  // ── Layer 1: elliptical floor pool (scaled circle, not a rectangle)
  ctx.save();
  ctx.translate(cx, cy + r * 0.92);
  ctx.scale(1.75 + hoverBoost * 0.2, 0.38);
  drawCircularBloom(
    ctx,
    0,
    0,
    r * 1.35,
    0.22 + activity * 0.12 + hoverBoost,
    palette.aura,
    14 * dpr
  );
  ctx.restore();

  // ── Layer 2: outer aura shells (animated, strictly circular)
  const auraLayers = [
    { scale: 1.72 + pulse * 0.06, alpha: 0.14 + activity * 0.08, blur: 22 * dpr },
    { scale: 1.48 + pulse * 0.04, alpha: 0.18 + activity * 0.1, blur: 12 * dpr },
    { scale: 1.28 + pulse * 0.03, alpha: 0.12 + hoverBoost, blur: 6 * dpr },
  ];
  for (const layer of auraLayers) {
    drawCircularBloom(ctx, cx, cy, r * layer.scale, layer.alpha, palette.aura, layer.blur);
  }

  // ── Layer 3: rotating aurora wisps
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 3; i++) {
    const angle = time * 0.00045 * (i + 1) + i * 2.1;
    const wx = cx + Math.cos(angle) * r * 0.15;
    const wy = cy + Math.sin(angle * 0.9) * r * 0.12;
    const wispRgb = i % 2 === 0 ? palette.aura : palette.auraSecondary;
    drawCircularBloom(
      ctx,
      wx,
      wy,
      r * (0.95 + i * 0.12),
      0.06 + activity * 0.05,
      wispRgb,
      18 * dpr
    );
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  // Processing orbit arcs
  if (state === 'processing') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.0012);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.22, 0.2, Math.PI * 1.35);
    ctx.stroke();
    ctx.rotate(Math.PI);
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.28, -0.4, Math.PI * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  // ── Sphere body
  const body = ctx.createRadialGradient(lightX, lightY, r * 0.04, cx, cy, r);
  body.addColorStop(0, palette.core);
  body.addColorStop(0.22, palette.mid);
  body.addColorStop(0.58, 'rgba(30, 58, 95, 0.96)');
  body.addColorStop(0.88, palette.deep);
  body.addColorStop(1, 'rgba(2, 8, 18, 1)');

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // Caustic veins — circular fills only, clipped to sphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const angle = time * 0.00035 * (i + 1) + i * 1.4;
    const nx = cx + Math.cos(angle) * r * 0.35;
    const ny = cy + Math.sin(angle * 0.85) * r * 0.28;
    const caustic = ctx.createRadialGradient(nx, ny, 0, nx, ny, r * (0.32 + i * 0.07));
    caustic.addColorStop(0, `rgba(34, 211, 238, ${0.06 + activity * 0.04})`);
    caustic.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = caustic;
    ctx.beginPath();
    ctx.arc(nx, ny, r * (0.32 + i * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Inner core
  const corePulse = 0.55 + Math.sin(time * 0.003) * 0.12 + pointer.hover * 0.2;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.42);
  core.addColorStop(0, `rgba(186, 230, 253, ${corePulse * activity})`);
  core.addColorStop(0.45, `rgba(37, 99, 235, ${0.15 + activity * 0.12})`);
  core.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Specular highlight
  const specX = cx + (pointer.x - 0.5) * r * 0.55 * (0.35 + pointer.hover * 0.65);
  const specY = cy + (pointer.y - 0.5) * r * 0.55 * (0.35 + pointer.hover * 0.65);
  const specSize = r * (0.22 + pointer.hover * 0.08);
  const spec = ctx.createRadialGradient(specX, specY, 0, specX, specY, specSize);
  spec.addColorStop(0, palette.specular);
  spec.addColorStop(0.35, 'rgba(186, 230, 253, 0.35)');
  spec.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(specX, specY, specSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Rim fresnel
  const rim = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r);
  rim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  rim.addColorStop(0.72, palette.rim);
  rim.addColorStop(1, `rgba(34, 211, 238, ${0.25 + pointer.hover * 0.2})`);
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Terminator shadow
  const shadowX = cx - (lightX - cx) * 0.35;
  const shadowY = cy - (lightY - cy) * 0.35;
  const shadow = ctx.createRadialGradient(shadowX, shadowY, r * 0.2, shadowX, shadowY, r * 1.05);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  shadow.addColorStop(0.55, 'rgba(0, 0, 0, 0.12)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Surface grain — tiny dots, not rects
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  for (let n = 0; n < 36; n++) {
    const a = (n / 36) * Math.PI * 2 + time * 0.00008;
    const dist = r * (0.15 + (n % 7) * 0.09);
    const px = cx + Math.cos(a) * dist;
    const py = cy + Math.sin(a * 1.1) * dist;
    ctx.fillStyle = `rgba(255,255,255,${0.012 + (n % 3) * 0.006})`;
    ctx.beginPath();
    ctx.arc(px, py, 0.6 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Listening / speaking ripple rings
  if (state === 'listening' || state === 'speaking') {
    const ripplePhase = (time * 0.004) % 1;
    ctx.strokeStyle = `rgba(34, 211, 238, ${0.35 * (1 - ripplePhase)})`;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1.05 + ripplePhase * 0.25), 0, Math.PI * 2);
    ctx.stroke();
  }
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
  const pointerRef = useRef({ x: 0.5, y: 0.42, hover: 0 });
  const hoverTarget = useRef(0);
  const rafRef = useRef<number>(0);
  const [hovered, setHovered] = useState(false);
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    canvas.width = dims.px * dims.dpr;
    canvas.height = dims.px * dims.dpr;

    const tick = (time: number) => {
      pointerRef.current.hover += (hoverTarget.current - pointerRef.current.hover) * 0.12;
      drawOrbFrame(ctx, dims.px, dims.dpr, time, pointerRef.current, state);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dims, state]);

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
      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={`axon-orb-title ${hovered ? 'axon-orb-title-active' : ''}`}>AXON</span>

        <div className="axon-orb-status mt-2 flex items-center gap-2">
          {isLive && (
            <span
              className={`axon-orb-pulse-dot ${state === 'processing' ? 'axon-orb-pulse-dot-fast' : ''}`}
              aria-hidden
            />
          )}
          <span className={`axon-orb-status-text ${hovered ? 'axon-orb-status-text-active' : ''}`}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
