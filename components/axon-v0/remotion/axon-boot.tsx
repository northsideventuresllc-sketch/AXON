'use client';

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const BOOT_FPS = 30;
export const BOOT_DURATION_IN_FRAMES = 255; // 8.5s (Cerebro → neon → WELCOME)
/** Frame the WELCOME line lands on — the boot page fires the voice here. */
export const WELCOME_FRAME = 182;

const CYAN = '#00D4FF';
const INK = '#07080C';

const BOOT_LINES = [
  'NORTHSIDE KERNEL … LINK ESTABLISHED',
  'NEURAL LATTICE … ONLINE',
  'TIER CHAIN … ARMED',
  'VENTURE GRID … SYNCED',
  'OPERATOR PROFILE … JB',
];

/** Deterministic neon flicker: settles to fully lit as `settle` approaches 1. */
function flicker(frame: number, seed: string, settle: number): number {
  if (settle >= 1) return 1;
  const n = random(`${seed}-${Math.floor(frame / 2)}`);
  const lit = n < 0.35 + settle * 0.65 ? 1 : 0.15;
  return lit * (0.55 + settle * 0.45);
}

/** Phase 1 — the machine assembles: radial lattice draws itself, boot log types on. */
const Lattice: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const build = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 60 });
  const fadeOut = interpolate(frame, [68, 82], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const CIRC = 2 * Math.PI * 88;

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: fadeOut }}>
      <svg width={260} height={260} viewBox="0 0 220 220" style={{ overflow: 'visible' }}>
        <circle
          cx={110}
          cy={110}
          r={88}
          fill="none"
          stroke={CYAN}
          strokeOpacity={0.7}
          strokeWidth={1.5}
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - build)}
          transform={`rotate(${frame * 0.8} 110 110)`}
        />
        <circle
          cx={110}
          cy={110}
          r={64}
          fill="none"
          stroke={CYAN}
          strokeOpacity={0.35}
          strokeWidth={1}
          strokeDasharray="4 10"
          transform={`rotate(${-frame * 1.4} 110 110)`}
        />
        {Array.from({ length: 12 }, (_, i) => {
          const grow = spring({
            frame: frame - i * 3,
            fps,
            config: { damping: 200 },
            durationInFrames: 30,
          });
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={110 + Math.cos(a) * 30}
              y1={110 + Math.sin(a) * 30}
              x2={110 + Math.cos(a) * (30 + 50 * grow)}
              y2={110 + Math.sin(a) * (30 + 50 * grow)}
              stroke={CYAN}
              strokeOpacity={0.4}
              strokeWidth={1}
            />
          );
        })}
        <circle cx={110} cy={110} r={5 + build * 3} fill={CYAN} opacity={0.9} />
      </svg>

      <div
        style={{
          marginTop: 36,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 15,
          lineHeight: 1.8,
          color: 'rgba(140, 225, 255, 0.85)',
          textAlign: 'left',
          minHeight: 5 * 27,
        }}
      >
        {BOOT_LINES.map((line, i) => {
          const start = 8 + i * 11;
          const chars = Math.round(
            interpolate(frame, [start, start + 10], [0, line.length], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          );
          if (chars <= 0) return <div key={line}>&nbsp;</div>;
          return (
            <div key={line}>
              <span style={{ color: CYAN, opacity: 0.6 }}>▸ </span>
              {line.slice(0, chars)}
              {chars < line.length && <span style={{ opacity: frame % 8 < 4 ? 1 : 0 }}>▌</span>}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Phase 2 — the neon sign: AXON flickers alive letter by letter, scanline sweeps. */
const NeonReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const local = frame - 78;
  if (local < 0) return null;

  const settle = interpolate(local, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rise = spring({ frame: local, fps, config: { damping: 200 }, durationInFrames: 30 });
  const scanY = interpolate(local, [6, 46], [-40, height + 40], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const subOpacity = interpolate(local, [28, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const deckOpacity = interpolate(local, [72, 88], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: scanY,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${CYAN}, transparent)`,
          opacity: 0.5,
        }}
      />
      <div style={{ transform: `translateY(${(1 - rise) * 24}px)`, textAlign: 'center' }}>
        <h1
          style={{
            margin: 0,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
            fontSize: 132,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: '#EAFBFF',
          }}
        >
          {'AXON'.split('').map((ch, i) => {
            const lit = flicker(frame, `axon-${i}`, Math.min(1, settle * (1.3 - i * 0.12)));
            return (
              <span
                key={i}
                style={{
                  opacity: lit,
                  textShadow: `0 0 ${18 * lit}px ${CYAN}, 0 0 ${52 * lit}px rgba(0,212,255,0.55)`,
                }}
              >
                {ch}
              </span>
            );
          })}
        </h1>
        <p
          style={{
            margin: '18px 0 0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 17,
            letterSpacing: '0.5em',
            color: 'rgba(148, 163, 184, 0.9)',
            opacity: subOpacity,
          }}
        >
          Northside Intelligence
        </p>
        <p
          style={{
            margin: '44px 0 0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 15,
            color: 'rgba(140, 225, 255, 0.85)',
            opacity: deckOpacity,
          }}
        >
          Bringing up your command deck…
        </p>
      </div>
    </AbsoluteFill>
  );
};

/** Ambient holographic waves behind everything, drawn from the frame clock. */
const Waves: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const paths = [0, 1, 2].map((layer) => {
    const amp = 26 + layer * 14;
    const yBase = height * (0.62 + layer * 0.11);
    const pts: string[] = [];
    for (let x = 0; x <= width; x += 40) {
      const y = yBase + Math.sin(x / 130 + frame / (22 - layer * 4) + layer * 2) * amp;
      pts.push(`${x},${y.toFixed(1)}`);
    }
    return { d: `M ${pts.join(' L ')}`, opacity: 0.1 - layer * 0.025 };
  });
  return (
    <AbsoluteFill>
      <svg width={width} height={height}>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={CYAN} strokeWidth={1.5} opacity={p.opacity} />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

/** Final phase — the operator's WELCOME line resolves out of the holographic field. */
const Welcome: React.FC<{ welcome: string }> = ({ welcome }) => {
  const frame = useCurrentFrame();
  const local = frame - (WELCOME_FRAME - 14);
  if (local < 0) return null;
  const rise = interpolate(local, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const blur = interpolate(local, [0, 22], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', opacity: rise, filter: `blur(${blur}px)`, transform: `translateY(${(1 - rise) * 18}px)` }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            letterSpacing: '0.55em',
            color: 'rgba(140,225,255,0.75)',
          }}
        >
          NORTHSIDE INTELLIGENCE
        </p>
        <h2
          style={{
            margin: '14px 0 0',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: '#EAFBFF',
            textShadow: `0 0 26px ${CYAN}, 0 0 70px rgba(0,212,255,0.5)`,
          }}
        >
          {welcome}
        </h2>
      </div>
    </AbsoluteFill>
  );
};

export const AxonBootComposition: React.FC<{ welcome?: string }> = ({ welcome = 'Welcome' }) => {
  const frame = useCurrentFrame();
  // hold the neon, then cross-fade it under the WELCOME line
  const neonOut = interpolate(frame, [WELCOME_FRAME - 18, WELCOME_FRAME], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeToBlack = interpolate(frame, [245, BOOT_DURATION_IN_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Waves />
      <Lattice />
      <AbsoluteFill style={{ opacity: neonOut }}>
        <NeonReveal />
      </AbsoluteFill>
      <Welcome welcome={welcome} />
      <AbsoluteFill style={{ backgroundColor: INK, opacity: fadeToBlack, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
