/** Canvas particle + filament engine for the AXON living orb */

export type OrbState = 'standby' | 'online' | 'listening' | 'speaking' | 'processing';

export interface OrbPalette {
  core: string;
  mid: string;
  deep: string;
  rim: string;
  specular: string;
  aura: string;
  auraSecondary: string;
}

export const ORB_PALETTES: Record<OrbState, OrbPalette> = {
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

function activityForState(state: OrbState): number {
  switch (state) {
    case 'processing':
      return 1;
    case 'listening':
      return 0.82;
    case 'speaking':
      return 0.68;
    case 'online':
      return 0.48;
    default:
      return 0.28;
  }
}

function seeded(seed: number): number {
  const v = Math.sin(seed * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface AmbientParticle {
  theta: number;
  phi: number;
  radius: number;
  speed: number;
  size: number;
  hueShift: number;
  absorb: number;
  absorbVel: number;
}

interface SpiralParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export interface OrbEngine {
  setState: (state: OrbState) => void;
  setPointer: (x: number, y: number, hover: number) => void;
  pulse: (amount?: number) => void;
  draw: (ctx: CanvasRenderingContext2D, size: number, dpr: number, time: number) => void;
}

export function createOrbEngine(initialState: OrbState = 'standby'): OrbEngine {
  const ambientCount = 72;
  const ambient: AmbientParticle[] = Array.from({ length: ambientCount }, (_, i) => {
    const s = seeded(i * 17.3 + 4.1);
    const s2 = seeded(i * 31.7 + 9.2);
    const s3 = seeded(i * 7.1 + 2.8);
    return {
      theta: s * Math.PI * 2,
      phi: Math.acos(2 * s2 - 1),
      radius: 1.12 + s3 * 0.55,
      speed: 0.12 + s * 0.35,
      size: 0.8 + s2 * 1.4,
      hueShift: s3,
      absorb: 0,
      absorbVel: 0,
    };
  });

  const spirals: SpiralParticle[] = [];
  let state: OrbState = initialState;
  let pointer = { x: 0.5, y: 0.42, hover: 0 };
  let pulseEnergy = 0;
  let spinY = 0;
  let lastEmit = 0;

  function emitSpiral(count: number) {
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.65 + Math.random() * 0.45;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      spirals.push({
        x,
        y,
        z,
        vx: -x * (1.4 + Math.random() * 0.6),
        vy: -y * (1.4 + Math.random() * 0.6),
        vz: -z * (1.4 + Math.random() * 0.6),
        life: 1,
      });
    }
  }

  function project(
    v: Vec3,
    cx: number,
    cy: number,
    r: number,
    tiltX: number,
    tiltY: number
  ): { x: number; y: number; depth: number; scale: number } {
    const cosX = Math.cos(tiltX);
    const sinX = Math.sin(tiltX);
    const cosY = Math.cos(tiltY);
    const sinY = Math.sin(tiltY);

    let x = v.x;
    let y = v.y * cosX - v.z * sinX;
    let z = v.y * sinX + v.z * cosX;
    const x2 = x * cosY + z * sinY;
    const z2 = -x * sinY + z * cosY;
    x = x2;
    z = z2;

    const depth = (z + 2) / 3;
    const scale = 0.55 + depth * 0.55;
    return { x: cx + x * r * scale, y: cy + y * r * scale, depth, scale };
  }

  function drawBloom(
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
    const g = ctx.createRadialGradient(x, y, radius * 0.04, x, y, radius);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(0.42, `rgba(${rgb}, ${alpha * 0.38})`);
    g.addColorStop(0.76, `rgba(${rgb}, ${alpha * 0.07})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function simplexNoise(x: number, y: number, z: number): number {
    return (
      Math.sin(x * 1.8 + z * 0.7) * 0.5 +
      Math.sin(y * 2.1 - x * 0.9) * 0.3 +
      Math.cos(z * 1.5 + y * 0.6) * 0.2
    );
  }

  return {
    setState(next) {
      if (next !== state && (next === 'processing' || next === 'listening')) {
        emitSpiral(next === 'processing' ? 18 : 10);
      }
      state = next;
    },

    setPointer(x, y, hover) {
      pointer = { x, y, hover };
    },

    pulse(amount = 1) {
      pulseEnergy = Math.min(1.4, pulseEnergy + amount * 0.35);
      emitSpiral(8);
    },

    draw(ctx, size, dpr, time) {
      const w = size * dpr;
      const h = size * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const palette = ORB_PALETTES[state];
      const activity = activityForState(state);

      pulseEnergy *= 0.94;
      spinY += 0.00035 + activity * 0.00055;

      const breathe = 1 + Math.sin(time * 0.0016) * (0.014 + activity * 0.012);
      const speakWave =
        state === 'speaking' ? Math.sin(time * 0.008) * 0.018 : 0;
      const baseR = size * 0.36 * dpr;
      const r = baseR * breathe * (1 + speakWave) * (1 + pointer.hover * 0.04 + pulseEnergy * 0.05);

      const tiltX = -0.38 + (pointer.y - 0.5) * 0.18 * pointer.hover;
      const tiltY = spinY + (pointer.x - 0.5) * 0.22 * pointer.hover;

      const lightX = cx + (-0.28 + (pointer.x - 0.5) * 0.3 * pointer.hover) * r;
      const lightY = cy + (-0.32 + (pointer.y - 0.5) * 0.3 * pointer.hover) * r;

      // Floor pool
      ctx.save();
      ctx.translate(cx, cy + r * 0.94);
      ctx.scale(1.8, 0.36);
      drawBloom(ctx, 0, 0, r * 1.4, 0.2 + activity * 0.14, palette.aura, 16 * dpr);
      ctx.restore();

      // Ambient particles — orbit + occasional absorb
      const projectedAmbient: Array<{ x: number; y: number; depth: number; alpha: number; size: number }> =
        [];

      const orbitSpeed = 0.00022 + activity * 0.00038;
      for (let i = 0; i < ambient.length; i++) {
        const p = ambient[i];
        p.theta += p.speed * orbitSpeed * (1 + activity * 0.8);

        if (state === 'processing' && Math.random() < 0.002) {
          p.absorb = 1;
          p.absorbVel = 0.018 + Math.random() * 0.01;
        }

        let rad = p.radius;
        if (p.absorb > 0) {
          rad = Math.max(0.55, rad - p.absorbVel);
          p.absorb *= 0.985;
          if (rad <= 0.58) {
            p.absorb = 0;
            p.radius = 1.12 + seeded(i + time * 0.001) * 0.55;
            p.theta += 0.5;
          }
        }

        const x3 = rad * Math.sin(p.phi) * Math.cos(p.theta);
        const y3 = rad * Math.sin(p.phi) * Math.sin(p.theta);
        const z3 = rad * Math.cos(p.phi);
        const proj = project({ x: x3, y: y3, z: z3 }, cx, cy, r, tiltX, tiltY);
        const alpha = (0.18 + activity * 0.35 + p.absorb * 0.4) * proj.depth;
        projectedAmbient.push({ x: proj.x, y: proj.y, depth: proj.depth, alpha, size: p.size * proj.scale });

        ctx.fillStyle = `rgba(${palette.aura}, ${alpha * 0.85})`;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, p.size * dpr * proj.scale * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      // Neural filaments between nearby particles
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const filamentDist = r * 0.42;
      for (let i = 0; i < projectedAmbient.length; i++) {
        for (let j = i + 1; j < projectedAmbient.length; j++) {
          const a = projectedAmbient[i];
          const b = projectedAmbient[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > filamentDist) continue;
          const t = 1 - dist / filamentDist;
          const alpha = t * t * (0.04 + activity * 0.08) * Math.min(a.depth, b.depth);
          ctx.strokeStyle = `rgba(${palette.auraSecondary}, ${alpha})`;
          ctx.lineWidth = 0.6 * dpr;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Spiral absorb particles
      for (let i = spirals.length - 1; i >= 0; i--) {
        const s = spirals[i];
        s.x += s.vx * 0.016;
        s.y += s.vy * 0.016;
        s.z += s.vz * 0.016;
        s.life *= 0.975;
        if (s.life < 0.05) {
          spirals.splice(i, 1);
          continue;
        }
        const proj = project(s, cx, cy, r, tiltX, tiltY);
        const alpha = s.life * (0.35 + activity * 0.4);
        drawBloom(ctx, proj.x, proj.y, 4 * dpr * proj.scale, alpha, palette.aura, 2 * dpr);
      }

      // Periodic emit while active
      if (activity > 0.5 && time - lastEmit > 900) {
        emitSpiral(4);
        lastEmit = time;
      }

      // Outer aura shells
      const pulse = 0.5 + Math.sin(time * 0.0024) * 0.5;
      for (const layer of [
        { scale: 1.78 + pulse * 0.07, alpha: 0.12 + activity * 0.1, blur: 24 * dpr },
        { scale: 1.52 + pulse * 0.05, alpha: 0.16 + activity * 0.12, blur: 14 * dpr },
        { scale: 1.3 + pulse * 0.03, alpha: 0.1 + pointer.hover * 0.08, blur: 7 * dpr },
      ]) {
        drawBloom(ctx, cx, cy, r * layer.scale, layer.alpha, palette.aura, layer.blur);
      }

      // Tilted energy rings
      ctx.save();
      ctx.translate(cx, cy);
      for (let ring = 0; ring < 3; ring++) {
        const ringTilt = tiltX + ring * 0.55 + Math.sin(time * 0.0006 + ring) * 0.08;
        const ringSpin = time * (0.0008 + ring * 0.00025) * (ring % 2 === 0 ? 1 : -1);
        ctx.save();
        ctx.rotate(ringSpin);
        ctx.scale(1, Math.cos(ringTilt) * 0.38 + 0.12);
        ctx.strokeStyle = `rgba(${palette.auraSecondary}, ${0.08 + activity * 0.14 + ring * 0.02})`;
        ctx.lineWidth = (1 + ring * 0.3) * dpr;
        ctx.setLineDash([6 * dpr, 10 * dpr]);
        ctx.lineDashOffset = -time * 0.04 * (ring + 1);
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.18 + ring * 0.14), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Processing orbit arcs
      if (state === 'processing') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * 0.0014);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.26, 0.15, Math.PI * 1.4);
        ctx.stroke();
        ctx.rotate(Math.PI * 0.85);
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.22)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.32, -0.3, Math.PI * 1.1);
        ctx.stroke();
        ctx.restore();
      }

      // Organic sphere body with noise-displaced silhouette
      const bodyGrad = ctx.createRadialGradient(lightX, lightY, r * 0.04, cx, cy, r * 1.02);
      bodyGrad.addColorStop(0, palette.core);
      bodyGrad.addColorStop(0.2, palette.mid);
      bodyGrad.addColorStop(0.55, 'rgba(30, 58, 95, 0.96)');
      bodyGrad.addColorStop(0.88, palette.deep);
      bodyGrad.addColorStop(1, 'rgba(2, 8, 18, 1)');

      ctx.beginPath();
      const segments = 96;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const nz = 0;
        const noise =
          simplexNoise(nx * 2 + time * 0.00035, ny * 2, time * 0.00025) *
          (0.04 + activity * 0.05);
        const dispR = r * (1 + noise);
        const px = cx + nx * dispR;
        const py = cy + ny * dispR * (0.92 + Math.sin(tiltX) * 0.08);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Holographic iridescence overlay
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
      ctx.clip();
      for (let band = 0; band < 4; band++) {
        const phase = time * 0.0009 + band * 1.6;
        const bx = cx + Math.cos(phase) * r * 0.25;
        const by = cy + Math.sin(phase * 0.85) * r * 0.2;
        const iri = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.55);
        const hue = band % 3;
        const c =
          hue === 0
            ? `rgba(34, 211, 238, ${0.04 + activity * 0.05})`
            : hue === 1
              ? `rgba(129, 140, 248, ${0.035 + activity * 0.04})`
              : `rgba(59, 130, 246, ${0.03 + activity * 0.035})`;
        iri.addColorStop(0, c);
        iri.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = iri;
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Caustic veins inside sphere
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.97, 0, Math.PI * 2);
      ctx.clip();
      for (let i = 0; i < 6; i++) {
        const angle = time * 0.00042 * (i + 1) + i * 1.2;
        const nx = cx + Math.cos(angle) * r * 0.38;
        const ny = cy + Math.sin(angle * 0.88) * r * 0.3;
        const caustic = ctx.createRadialGradient(nx, ny, 0, nx, ny, r * (0.28 + i * 0.06));
        caustic.addColorStop(0, `rgba(34, 211, 238, ${0.07 + activity * 0.06})`);
        caustic.addColorStop(0.65, 'rgba(0,0,0,0)');
        ctx.fillStyle = caustic;
        ctx.beginPath();
        ctx.arc(nx, ny, r * (0.28 + i * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Living core
      const corePulse = 0.58 + Math.sin(time * 0.0032) * 0.14 + pointer.hover * 0.18 + pulseEnergy * 0.25;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.45);
      core.addColorStop(0, `rgba(186, 230, 253, ${corePulse * (0.5 + activity * 0.5)})`);
      core.addColorStop(0.4, `rgba(37, 99, 235, ${0.18 + activity * 0.16})`);
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Specular
      const specX = cx + (pointer.x - 0.5) * r * 0.5 * (0.4 + pointer.hover * 0.6);
      const specY = cy + (pointer.y - 0.5) * r * 0.5 * (0.4 + pointer.hover * 0.6);
      const specSize = r * (0.24 + pointer.hover * 0.1);
      const spec = ctx.createRadialGradient(specX, specY, 0, specX, specY, specSize);
      spec.addColorStop(0, palette.specular);
      spec.addColorStop(0.32, 'rgba(186, 230, 253, 0.38)');
      spec.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(specX, specY, specSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Rim fresnel
      const rim = ctx.createRadialGradient(cx, cy, r * 0.76, cx, cy, r);
      rim.addColorStop(0, 'rgba(0,0,0,0)');
      rim.addColorStop(0.7, palette.rim);
      rim.addColorStop(1, `rgba(34, 211, 238, ${0.28 + pointer.hover * 0.22 + activity * 0.12})`);
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Ripple rings for listen/speak
      if (state === 'listening' || state === 'speaking') {
        for (let wave = 0; wave < 2; wave++) {
          const phase = ((time * 0.0035 + wave * 0.5) % 1);
          ctx.strokeStyle = `rgba(34, 211, 238, ${0.32 * (1 - phase)})`;
          ctx.lineWidth = (1.2 + wave * 0.4) * dpr;
          ctx.beginPath();
          ctx.arc(cx, cy, r * (1.04 + phase * 0.32), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
  };
}
