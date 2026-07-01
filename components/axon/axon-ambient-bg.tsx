'use client';

import { useEffect, useRef } from 'react';

export function AxonAmbientBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let raf = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const orbs = Array.from({ length: 5 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 120 + i * 40,
      speed: 0.0003 + i * 0.0001,
      hue: 260 + i * 8,
    }));

    const draw = () => {
      frame++;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (const orb of orbs) {
        orb.x += Math.sin(frame * orb.speed) * 0.0008;
        orb.y += Math.cos(frame * orb.speed * 1.3) * 0.0006;

        const cx = orb.x * w;
        const cy = orb.y * h;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orb.r);
        grad.addColorStop(0, `hsla(${orb.hue}, 45%, 35%, 0.18)`);
        grad.addColorStop(0.5, `hsla(${orb.hue}, 40%, 25%, 0.06)`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - orb.r, cy - orb.r, orb.r * 2, orb.r * 2);
      }

      raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-60"
      aria-hidden
    />
  );
}
