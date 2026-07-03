export const OPERATOR_ID = 'default';

export const DEFAULT_TONE_PRESET = {
  style: 'neutral',
  warmth: 0.5,
  directness: 0.6,
  formality: 0.4,
  humor: 0.2,
  summary:
    'Clear, calm, and adaptable. Professional but human — never robotic or corporate.',
};

export const AXON_VOICES = [
  { id: 'default', name: 'AXON Default', lang: 'en-US' },
  { id: 'warm', name: 'Warm & Steady', lang: 'en-US' },
  { id: 'crisp', name: 'Crisp & Direct', lang: 'en-US' },
  { id: 'uk', name: 'British', lang: 'en-GB' },
];

/** Voice preference hints mapped to SpeechSynthesis voice selection */
export const VOICE_HINTS: Record<string, { pitch?: number; rate?: number; lang?: string }> = {
  default: { pitch: 1, rate: 0.95, lang: 'en-US' },
  warm: { pitch: 0.92, rate: 0.9, lang: 'en-US' },
  crisp: { pitch: 1.05, rate: 1.05, lang: 'en-US' },
  uk: { pitch: 1, rate: 0.95, lang: 'en-GB' },
};

export type InputMode = 'chat' | 'voice';

export type SignalType =
  | 'tone'
  | 'phrasing'
  | 'preference'
  | 'interpretation'
  | 'response_pattern'
  | 'vocabulary';

export interface TonePreset {
  style: string;
  warmth: number;
  directness: number;
  formality: number;
  humor: number;
  summary?: string;
  learned_patterns?: string[];
  preferred_phrases?: string[];
  avoid_phrases?: string[];
}

export interface OperatorProfile {
  operator_id: string;
  input_mode: InputMode;
  read_aloud: boolean;
  voice_id: string;
  voice_name: string | null;
  tone_preset: TonePreset;
  context_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  operator_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  channel: InputMode;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CommunicationSignal {
  id: string;
  operator_id: string;
  signal_type: SignalType;
  signal_key: string;
  signal_value: string;
  evidence_count: number;
  weight: number;
  last_reinforced_at: string;
  created_at: string;
}

export interface AxonMemory {
  id: string;
  operator_id: string;
  content: string;
  memory_type: 'fact' | 'preference' | 'context' | 'relationship';
  confidence: number;
  source_message_id: string | null;
  created_at: string;
}

export interface AxonTool {
  slug: string;
  name: string;
  description: string;
  status: 'active' | 'building' | 'planned';
  icon: string;
  href: string;
  phase?: number;
  metric?: string;
}

export type BriefingPriority = 'high' | 'medium' | 'low';

export interface BriefingItem {
  id: string;
  title: string;
  content: string;
  priority: BriefingPriority;
  source: 'user' | 'axon';
  created_at: string;
  updated_at: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  source: 'user' | 'axon';
  due?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AxonWorkspace {
  briefing: BriefingItem[];
  todos: TodoItem[];
  briefing_autonomous: boolean;
  todos_autonomous: boolean;
  last_briefing_refresh?: string;
  last_todo_refresh?: string;
}

export const DEFAULT_WORKSPACE: AxonWorkspace = {
  briefing: [],
  todos: [],
  briefing_autonomous: false,
  todos_autonomous: false,
};

export const AXON_TOOLS: AxonTool[] = [
  {
    slug: 'ni-services-outreach',
    name: 'NI Services Outreach',
    description:
      '24/7 B2B prospecting — find, score, draft outreach, queue for approval, close paid clients.',
    status: 'active',
    icon: '◎',
    href: '/tools/ni-outreach',
    phase: 1,
    metric: 'pending',
  },
  {
    slug: 'follow-up-engine',
    name: 'Follow-Up Engine',
    description: 'Automated follow-up sequences for sent outreach. Re-engage warm leads.',
    status: 'building',
    icon: '↻',
    href: '/tools/follow-up',
    phase: 1,
  },
  {
    slug: 'hermes-sync',
    name: 'Hermes Task Sync',
    description: 'Mirror Hermes marketing tasks into AXON. Sync only — no LLM overlap.',
    status: 'planned',
    icon: '⚡',
    href: '/tools/hermes',
    phase: 2,
  },
  {
    slug: 'deal-tracker',
    name: 'Deal Tracker',
    description: 'Track proposals, negotiations, and closed-won revenue across the pipeline.',
    status: 'planned',
    icon: '◆',
    href: '/tools/deals',
    phase: 2,
  },
];
