'use client';

import type { DroidFaceShape } from '@/lib/axon-cron-jobs';

type AxonDroidAvatarProps = {
  faceShape: DroidFaceShape;
  role: string;
  active: boolean;
  sleeping?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
};

const FACE_PATH: Record<DroidFaceShape, string> = {
  circle: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  square: 'M8 8h8v8H8V8Z',
  triangle: 'M12 6l6 10H6l6-10Z',
  hex: 'M12 5l5.2 3v6L12 17l-5.2-3V8L12 5Z',
  diamond: 'M12 5l7 7-7 7-7-7 7-7Z',
};

const SIZE_MAP = { sm: 36, md: 48, lg: 72 };

export function AxonDroidAvatar({
  faceShape,
  role,
  active,
  sleeping = false,
  size = 'md',
  className = '',
  style,
}: AxonDroidAvatarProps) {
  const px = SIZE_MAP[size];
  const animClass = sleeping ? 'axon-droid-sleep' : active ? 'axon-droid-work' : 'axon-droid-idle';

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 28"
      className={`axon-droid ${animClass} ${className}`}
      style={style}
      role="img"
      aria-label={`AXON Droid ${role}${sleeping ? ' sleeping' : active ? ' working' : ''}`}
    >
      <defs>
        <linearGradient id="axonDroidBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4da3ff" />
          <stop offset="100%" stopColor="#1e5fbf" />
        </linearGradient>
      </defs>
      <ellipse cx="12" cy="18" rx="7" ry="8" fill="url(#axonDroidBody)" opacity={sleeping ? 0.55 : 1} />
      <rect x="8" y="14" width="8" height="2" rx="1" fill="#0d3a7a" opacity="0.5" />
      <circle cx="12" cy="10" r="6" fill="#5eb0ff" opacity={sleeping ? 0.6 : 1} />
      <path d={FACE_PATH[faceShape]} fill="#0a2d5c" opacity={sleeping ? 0.45 : 0.85} />
      {!sleeping && active && (
        <>
          <circle cx="9.5" cy="9" r="1" fill="#b8f0ff" className="axon-droid-eye" />
          <circle cx="14.5" cy="9" r="1" fill="#b8f0ff" className="axon-droid-eye" />
        </>
      )}
      {sleeping && <text x="12" y="11" textAnchor="middle" fontSize="4" fill="#0a2d5c">z</text>}
    </svg>
  );
}
