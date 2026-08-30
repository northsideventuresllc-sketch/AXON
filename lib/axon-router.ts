/**
 * Typed wrapper over the router core.
 *
 * Same split as lib/axon-fire-gate.ts / lib/axon-fire-gate-core.mjs: the runtime lives in
 * plain .mjs so raw `node` scripts under GitHub Actions can import it with no TS loader,
 * and this file gives the Next.js/TS side types.
 */
export {
  routeChat,
  classifyCapability,
  listCandidateLanes,
  scoreLanes,
  executeLane,
  recordUsage,
  CAPABILITY_CLASSES,
} from './axon-router-core.mjs';

export type CapabilityClass =
  | 'cheap_chat'
  | 'long_context'
  | 'code_build'
  | 'reasoning_planning'
  | 'vision'
  | 'tool_use_agentic'
  | 'computer_use';

export type ConnectorKind = 'api' | 'subscription' | 'local';

export interface Lane {
  laneId: string;
  model: string;
  route: {
    id: string;
    name: string;
    kind: string;
    connector_kind: ConnectorKind;
    cli_command: string | null;
    base_url: string | null;
    secret_key: string | null;
    requires_mini: boolean;
  };
  connectorKind: ConnectorKind;
  capabilities: CapabilityClass[];
  costTier: 0 | 1 | 2 | 3;
  isSafetyNet: boolean;
  priority: number;
  sortOrder: number;
}

export interface ScoredLane {
  lane: Lane;
  score: number;
  reasons: string[];
}

export interface RouteResult {
  reply: string;
  route: string;
  capabilityClass: CapabilityClass;
  decisionId: string | null;
  /** Result of parsing/validating/executing a tool-call block in `reply`, if any. */
  tool: { tool: string; valid: boolean; reason?: string; result?: unknown; message?: string } | null;
}
