export type AgentRole =
  | 'exec_assistant'
  | 'build_manager'
  | 'pulse'
  | 'council'
  | 'creator'
  | 'sensei'
  | 'custom';

export interface Venture {
  id: string;
  name: string;
  tagline: string | null;
  accent: string;
  sort_order: number;
  settings: Record<string, unknown>;
  /** Parent venture, or null for a top-level one. The database caps nesting at one level. */
  parent_id: string | null;
}

export interface VentureAgent {
  id: string;
  venture_id: string;
  role: AgentRole;
  name: string;
  description: string | null;
  is_template: boolean;
  config: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  venture_id: string | null;
  agent_id: string | null;
  thread: string;
  sender: string;
  content: string;
  created_at: string;
}

export interface ModelProvider {
  id: string;
  label: string;
  kind: 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama';
  base_url: string | null;
  model: string;
  has_key: boolean; // key itself never leaves the server
}

export interface AgentModelAssignment {
  agent_id: string;
  mode: 'auto' | 'fixed';
  /** A router_models row — a route x model pair. Null means auto. */
  lane_id: string | null;
  /** Optional custom lane order for this agent, overriding the scored order. */
  fixed_order?: string[] | null;
}

export interface VentureTool {
  id: string;
  venture_id: string;
  tool_slug: string;
  display_name: string | null;
  notes: string | null;
  config: Record<string, unknown>;
}

export const DEFAULT_AGENTS: Array<{ role: AgentRole; name: string; description: string }> = [
  {
    role: 'exec_assistant',
    name: 'Venture Exec Assistant',
    description:
      'Captain of the venture. Manages every other agent, consults the Council before escalating to you, and works with the main AXON exec to make things happen.',
  },
  {
    role: 'build_manager',
    name: 'Build Manager',
    description:
      'Owns everything being built. Dispatches sub-agents for ongoing builds; take one-off builds straight to it via chat IDE or CLI.',
  },
  {
    role: 'pulse',
    name: 'Pulse',
    description:
      'Checks venture health on your schedule, fixes what it can, and elevates anything concerning to the Exec Assistant.',
  },
  {
    role: 'council',
    name: 'Council',
    description:
      'Advisory buffer for the Exec Assistant — carries backend decisions you choose not to be involved in.',
  },
  {
    role: 'creator',
    name: 'Agent / Skill / Workflow Creator',
    description:
      'Creates, updates and manages new agents, skills and workflows. Never spawns sub-agents itself — the agents it creates do that via graph engineering.',
  },
  {
    role: 'sensei',
    name: 'Sensei',
    description:
      'Grades this venture’s own agents and owns their improvement loop. Reads what the venture actually shipped against what it said it would, and writes the fix back into the agent instructions.',
  },
];
