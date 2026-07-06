/**
 * AXON orb — restrained glass-sphere renderer.
 *
 * Design refs: Apple Intelligence glow (soft metaball interior),
 * Jarvis Orb v3 (desaturated palette, minimal motion), visionOS Siri orb.
 * Avoids: particle storms, neural filaments, dashed rings, neon overload.
 */

export type OrbState = 'standby' | 'online' | 'listening' | 'speaking' | 'processing';

interface OrbTheme {
  /** RGB strings for blooms, e.g. "74, 124, 155" */
  glow: string;
  accent: string;
  core: string;
  mid: string;
  deep: string;
  glass: string;
  specular: string;
}

const THEMES: Record<OrbState, OrbTheme> = {
  standby: {
    glow: '58, 78, 108',
    accent: '74, 124, 155',
    core: 'rgba(148, 178, 205, 0.42)',
    mid: 'rgba(52, 88, 118, 0.88)',
    deep: 'rgba(6, 12, 22, 0.98)',
    glass: 'rgba(186, 210, 230, 0.12)',
    specular: 'rgba(220, 232, 245, 0.55)',
  },
  online: {
    glow: '64, 104, 138',
    accent: '82, 138, 168',
    core: 'rgba(165, 198, 220, 0.52)',
    mid: 'rgba(58, 98, 132, 0.9)',
    deep: 'rgba(8, 14, 26, 0.98)',
    glass: 'rgba(196, 218, 235, 0.14)',
    specular: 'rgba(235, 244, 252, 0.62)',
  },
  listening: {
    glow: '70, 130, 158',
    accent: '91, 184, 212',
    core: 'rgba(175, 220, 235, 0.58)',
    mid: 'rgba(62, 128, 152, 0.92)',
    deep: 'rgba(6, 16, 28, 0.98)',
    glass: 'rgba(200, 232, 242, 0.16)',
    specular: 'rgba(240, 250, 255, 0.7)',
  },
  speaking: {
    glow: '88, 108, 148',
    accent: '122, 138, 176',
    core: 'rgba(188, 198, 225, 0.5)',
    mid: 'rgba(78, 92, 128, 0.9)',
    deep: 'rgba(10, 12, 24, 0.98)',
    glass: 'rgba(210, 216, 235, 0.14)',
    specular: 'rgba(245, 246, 252, 0.65)',
  },
  processing: {
    glow: '82, 118, 168',
    accent: '107, 95, 160',
    core: 'rgba(195, 210, 240, 0.62)',
    mid: 'rgba(72, 98, 145, 0.92)',
    deep: 'rgba(6, 10, 22, 0.98)',
    glass: 'rgba(210, 218, 240, 0.17)',
    specular: 'rgba(248, 250, 255, 0.75)',
  },
};

function targetEnergy(state: OrbState): number {
  switch (state) {
    case 'processing':
      return 1;
    case 'listening':
      return 0.72;
    case 'speaking':
      return 0.58;
    case 'online':
      return 0.38;
    default:
      return 0.18;
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothNoise(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 1.4 + t * 0.00028) * 0.45 +
    Math.sin(y * 1.7 - t * 0.00022) * 0.35 +
    Math.cos((x + y) * 0.9 + t * 0.00018) * 0.2
  );
}

interface SmokeBlob {
  phase: number;
  radius: number;
  tilt: number;
  speed: number;
  alpha: number;
  rgb: string;
}

export interface OrbEngine {
  setState: (state: OrbState) => void;
  setPointer: (x: number, y: number, hover: number) => void;
  draw: (ctx: CanvasRenderingContext2D, size: number, dpr: number, time: number) => void;
}

export function createOrbEngine(initialState: OrbState = 'standby'): OrbEngine {
  let state = initialState;
  let energy = targetEnergy(initialState);
  let pointer = { x: 0.5, y: 0.38, hover: 0 };

  const blobs: SmokeBlob[] = [
    { phase: 0, radius: 0.22, tilt: 0.3, speed: 0.00038, alpha: 0.14, rgb: '91, 140, 168' },
    { phase: 2.1, radius: 0.28, tilt: -0.45, speed: 0.00032, alpha: 0.11, rgb: '107, 95, 160' },
    { phase: 4.2, radius: 0.18, tilt: 0.65, speed: 0.00044, alpha: 0.1, rgb: '74, 124, 155' },
    { phase: 1.4, radius: 0.15, tilt: -0.2, speed: 0.0005, alpha: 0.08, rgb: '122, 138, 176' },
  ];

  function bloom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    alpha: number,
    rgb: string,
    blur = 0
  ) {
    ctx.save();
    if (blur > 0) ctx.filter = `blur(${blur}px)`;
    const g = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(0.5, `rgba(${rgb}, ${alpha * 0.28})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSpherePath(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    time: number,
    wobble: number
  ) {
    const segments = 80;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const n = smoothNoise(nx * 1.6, ny * 1.6, time) * wobble;
      const px = cx + nx * r * (1 + n);
      const py = cy + ny * r * (1 + n);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  return {
    setState(next) {
      state = next;
    },

    setPointer(x, y, hover) {
      pointer = { x, y, hover };
    },

    draw(ctx, size, dpr, time) {
      const w = size * dpr;
      const h = size * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      energy = lerp(energy, targetEnergy(state), 0.045);
      const theme = THEMES[state];

      const cx = w / 2;
      const cy = h / 2;
      const breathe = 1 + Math.sin(time * 0.00135) * (0.008 + energy * 0.006);
      const speak =
        state === 'speaking' ? Math.sin(time * 0.0055) * 0.006 : 0;
      const baseR = size * 0.34 * dpr;
      const r = baseR * breathe * (1 + speak) * (1 + pointer.hover * 0.018);

      const lightX = cx + (pointer.x - 0.38) * r * (0.35 + pointer.hover * 0.45);
      const lightY = cy + (pointer.y - 0.35) * r * (0.35 + pointer.hover * 0.45);

      // Floor reflection
      ctx.save();
      ctx.translate(cx, cy + r * 0.95);
      ctx.scale(1.55, 0.28);
      bloom(ctx, 0, 0, r * 1.1, 0.06 + energy * 0.05, theme.glow, 18 * dpr);
      ctx.restore();

      // Single ambient halo
      bloom(ctx, cx, cy, r * 1.55, 0.05 + energy * 0.06, theme.glow, 28 * dpr);

      // Apple-style soft outer band (very subtle)
      if (energy > 0.25) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const band = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.08);
        band.addColorStop(0, 'rgba(0,0,0,0)');
        band.addColorStop(0.55, `rgba(${theme.accent}, ${0.04 + energy * 0.06})`);
        band.addColorStop(0.85, `rgba(${theme.accent}, ${0.02 + energy * 0.03})`);
        band.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = band;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Sphere body — dark glass
      const body = ctx.createRadialGradient(lightX, lightY, r * 0.03, cx, cy, r);
      body.addColorStop(0, theme.core);
      body.addColorStop(0.28, theme.mid);
      body.addColorStop(0.62, theme.deep);
      body.addColorStop(0.9, 'rgba(2, 6, 14, 1)');
      body.addColorStop(1, 'rgba(0, 0, 0, 1)');

      drawSpherePath(ctx, cx, cy, r, time, 0.012 + energy * 0.01);
      ctx.fillStyle = body;
      ctx.fill();

      // Internal smoke blobs (clipped)
      ctx.save();
      drawSpherePath(ctx, cx, cy, r * 0.97, time, 0.008);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      for (const blob of blobs) {
        const speed = blob.speed * (1 + energy * 1.8);
        const t = time * speed + blob.phase;
        const bx = cx + Math.cos(t) * r * blob.radius;
        const by = cy + Math.sin(t * 0.85 + blob.tilt) * r * blob.radius * 0.75;
        const br = r * (0.34 + blob.radius * 0.5);
        const alpha = blob.alpha * (0.55 + energy * 0.65);
        bloom(ctx, bx, by, br, alpha, blob.rgb, 10 * dpr);
      }
      ctx.restore();

      // Core ember
      const corePulse = 0.42 + Math.sin(time * 0.0024) * 0.08 + energy * 0.28;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.32);
      core.addColorStop(0, `rgba(${theme.accent}, ${corePulse * 0.35})`);
      core.addColorStop(0.55, `rgba(${theme.glow}, ${corePulse * 0.12})`);
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Glass shell — frosted edge
      const glass = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      glass.addColorStop(0, 'rgba(0,0,0,0)');
      glass.addColorStop(0.72, theme.glass);
      glass.addColorStop(0.92, `rgba(${theme.accent}, ${0.1 + energy * 0.08})`);
      glass.addColorStop(1, `rgba(${theme.accent}, ${0.16 + energy * 0.1})`);
      ctx.fillStyle = glass;
      drawSpherePath(ctx, cx, cy, r, time, 0.01);
      ctx.fill();

      // Specular highlight
      const specX = cx + (pointer.x - 0.5) * r * 0.42 * (0.5 + pointer.hover * 0.5);
      const specY = cy + (pointer.y - 0.5) * r * 0.42 * (0.5 + pointer.hover * 0.5);
      const specR = r * (0.16 + pointer.hover * 0.05);
      const spec = ctx.createRadialGradient(specX, specY, 0, specX, specY, specR);
      spec.addColorStop(0, theme.specular);
      spec.addColorStop(0.4, `rgba(255,255,255,${0.08 + energy * 0.06})`);
      spec.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(specX, specY, specR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Terminator shadow for depth
      const shadowX = cx - (lightX - cx) * 0.4;
      const shadowY = cy - (lightY - cy) * 0.4;
      const shadow = ctx.createRadialGradient(shadowX, shadowY, r * 0.15, shadowX, shadowY, r * 1.05);
      shadow.addColorStop(0, 'rgba(0,0,0,0.28)');
      shadow.addColorStop(0.6, 'rgba(0,0,0,0.08)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = shadow;
      drawSpherePath(ctx, cx, cy, r, time, 0.008);
      ctx.fill();
      ctx.restore();

      // Listening — single soft ripple only
      if (state === 'listening') {
        const phase = (time * 0.0028) % 1;
        ctx.strokeStyle = `rgba(${theme.accent}, ${0.18 * (1 - phase)})`;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1.02 + phase * 0.14), 0, Math.PI * 2);
        ctx.stroke();
      }

      // Processing — slow inner shimmer arc (no dashed rings)
      if (state === 'processing' && energy > 0.7) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * 0.00055);
        ctx.strokeStyle = `rgba(${theme.accent}, 0.12)`;
        ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.78, 0.4, Math.PI * 1.15);
        ctx.stroke();
        ctx.restore();
      }
    },
  };
}
