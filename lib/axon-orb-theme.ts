import type { JarvisPaletteValues, JarvisStateTarget } from 'jarvis-ai-web-animation';

/** AXON blue → purple palette for the WebGL orb */
export const AXON_ORB_PALETTE: JarvisPaletteValues = {
  core: 0xeaf0ff,
  primary: 0x4f7dff,
  secondary: 0x8b5cf6,
  tertiary: 0x38bdf8,
  deep: 0x1a1040,
  fallback:
    'radial-gradient(circle at 50% 48%, rgba(234,240,255,0.96) 0%, rgba(79,125,255,0.82) 16%, rgba(139,92,246,0.52) 40%, rgba(26,16,64,0.24) 70%, rgba(0,0,0,0) 84%)',
};

export type AxonOrbVisualState =
  | 'standby'
  | 'online'
  | 'listening'
  | 'speaking'
  | 'processing';

export const AXON_ORB_STATES: Record<AxonOrbVisualState, JarvisStateTarget> = {
  standby: {
    energy: 0.58,
    rotationSpeed: 0.42,
    particleSpeed: 0.48,
    shellRadius: 1,
    ringSpread: 0.92,
    filamentOpacity: 0.32,
    coreScale: 0.9,
    bloom: 0.5,
  },
  online: {
    energy: 0.82,
    rotationSpeed: 0.62,
    particleSpeed: 0.72,
    shellRadius: 1.02,
    ringSpread: 0.98,
    filamentOpacity: 0.42,
    coreScale: 0.96,
    bloom: 0.62,
  },
  listening: {
    energy: 1.05,
    rotationSpeed: 0.95,
    particleSpeed: 1.15,
    shellRadius: 1.06,
    ringSpread: 1.06,
    filamentOpacity: 0.52,
    coreScale: 1.04,
    bloom: 0.78,
  },
  speaking: {
    energy: 0.96,
    rotationSpeed: 0.78,
    particleSpeed: 1.02,
    shellRadius: 1.04,
    ringSpread: 1.03,
    filamentOpacity: 0.46,
    coreScale: 1.02,
    bloom: 0.72,
  },
  processing: {
    energy: 1.14,
    rotationSpeed: 1.28,
    particleSpeed: 1.22,
    shellRadius: 1.08,
    ringSpread: 1.1,
    filamentOpacity: 0.56,
    coreScale: 1.08,
    bloom: 0.88,
  },
};
