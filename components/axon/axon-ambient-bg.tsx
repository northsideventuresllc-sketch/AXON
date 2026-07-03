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

    const orbs = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 100 + i * 36,
      speed: 0.00025 + i * 0.00008,
      hue: 215 + i * 12,
    }));

    const draw = () => {
      frame++;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, 'rgba(5, 11, 22, 0.3)');
      bgGrad.addColorStop(0.5, 'rgba(10, 20, 36, 0.1)');
      bgGrad.addColorStop(1, 'rgba(67, 56, 202, 0.08)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      for (const orb of orbs) {
        orb.x += Math.sin(frame * orb.speed) * 0.0007;
        orb.y += Math.cos(frame * orb.speed * 1.2) * 0.0005;

        const cx = orb.x * w;
        const cy = orb.y * h;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orb.r);
        grad.addColorStop(0, `hsla(${orb.hue}, 70%, 52%, 0.14)`);
        grad.addColorStop(0.45, `hsla(${orb.hue + 15}, 55%, 38%, 0.06)`);
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
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
      aria-hidden
    />
  );
}
