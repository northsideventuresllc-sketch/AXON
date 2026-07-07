export type AxonOrbVisualState =
  | 'standby'
  | 'online'
  | 'listening'
  | 'speaking'
  | 'processing';

export interface AxonOrbStatusMeta {
  label: string;
  dotClass: string;
  pulseFast?: boolean;
}

export const AXON_ORB_STATUS: Record<AxonOrbVisualState, AxonOrbStatusMeta> = {
  standby: { label: 'Idle', dotClass: 'axon-orb-status-dot--idle' },
  online: { label: 'Active', dotClass: 'axon-orb-status-dot--active' },
  listening: { label: 'Listening', dotClass: 'axon-orb-status-dot--listening' },
  speaking: { label: 'Speaking', dotClass: 'axon-orb-status-dot--speaking' },
  processing: { label: 'Thinking', dotClass: 'axon-orb-status-dot--thinking', pulseFast: true },
};

export function resolveAxonOrbState(
  active: boolean,
  listening?: boolean,
  speaking?: boolean,
  processing?: boolean
): AxonOrbVisualState {
  if (processing) return 'processing';
  if (listening) return 'listening';
  if (speaking) return 'speaking';
  if (active) return 'online';
  return 'standby';
}
