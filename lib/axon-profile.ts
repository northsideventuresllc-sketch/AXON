import { createSupabaseClient } from './supabase.mjs';
import {
  buildCommSkillInstructions,
  mergeTechniquesWithDefaults,
} from './axon-comm-skill.mjs';
import {
  DEFAULT_TONE_PRESET,
  OPERATOR_ID,
  type ChatMessage,
  type CommunicationSignal,
  type AxonMemory,
  type OperatorProfile,
  type TonePreset,
} from './axon-types';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function client() {
  return createSupabaseClient(getSupabaseKey());
}

export async function getOperatorProfile(operatorId = OPERATOR_ID): Promise<OperatorProfile> {
  const { sbSelect, sbInsert } = client();
  const rows = (await sbSelect(
    'axon_operator_profiles',
    `operator_id=eq.${operatorId}&select=*&limit=1`
  )) as OperatorProfile[];

  if (rows?.[0]) return rows[0];

  const created = (await sbInsert('axon_operator_profiles', {
    operator_id: operatorId,
    tone_preset: DEFAULT_TONE_PRESET,
  })) as OperatorProfile;
  return created;
}

export async function updateOperatorProfile(
  operatorId: string,
  patch: Partial<OperatorProfile>
) {
  const { sbPatch } = client();
  return sbPatch('axon_operator_profiles', `operator_id=eq.${operatorId}`, {
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

export async function fetchChatHistory(operatorId = OPERATOR_ID, limit = 40): Promise<ChatMessage[]> {
  const { sbSelect } = client();
  const rows = (await sbSelect(
    'axon_chat_messages',
    `operator_id=eq.${operatorId}&select=*&order=created_at.desc&limit=${limit}`
  )) as ChatMessage[];
  return (rows || []).reverse();
}

export async function insertChatMessage(msg: {
  operator_id?: string;
  role: ChatMessage['role'];
  content: string;
  channel?: ChatMessage['channel'];
  metadata?: Record<string, unknown>;
  session_id?: string;
}) {
  const { sbInsert } = client();
  const metadata = { ...(msg.metadata || {}) };
  if (msg.session_id) metadata.session_id = msg.session_id;
  return sbInsert('axon_chat_messages', {
    operator_id: msg.operator_id || OPERATOR_ID,
    role: msg.role,
    content: msg.content,
    channel: msg.channel || 'chat',
    metadata,
  }) as Promise<ChatMessage>;
}

export async function fetchTopSignals(
  operatorId = OPERATOR_ID,
  limit = 20
): Promise<CommunicationSignal[]> {
  const { sbSelect } = client();
  const rows = (await sbSelect(
    'axon_communication_signals',
    `operator_id=eq.${operatorId}&select=*&order=weight.desc&limit=${limit}`
  )) as CommunicationSignal[];
  return rows || [];
}

/** AX-COMM-SKILL technique catalog from NI-Brain (dual-brain runtime memory). */
export async function fetchCommunicationTechniques(): Promise<
  ReturnType<typeof mergeTechniquesWithDefaults>
> {
  try {
    const { sbSelect } = client();
    const rows = (await sbSelect(
      'axon_communication_profile',
      'select=*&order=weight.desc',
    )) as Array<{
      id?: number;
      technique_id: string;
      description: string;
      weight?: number;
      evidence?: string | null;
      source?: string | null;
    }>;
    return mergeTechniquesWithDefaults(rows || []);
  } catch {
    return mergeTechniquesWithDefaults([]);
  }
}

export { buildCommSkillInstructions };

export async function upsertSignal(input: {
  operator_id?: string;
  signal_type: CommunicationSignal['signal_type'];
  signal_key: string;
  signal_value: string;
  weight_delta?: number;
}) {
  const { sbSelect, sbInsert, sbPatch } = client();
  const operatorId = input.operator_id || OPERATOR_ID;

  const existing = (await sbSelect(
    'axon_communication_signals',
    `operator_id=eq.${operatorId}&signal_type=eq.${input.signal_type}&signal_key=eq.${encodeURIComponent(input.signal_key)}&select=*&limit=1`
  )) as CommunicationSignal[];

  if (existing?.[0]) {
    const row = existing[0];
    const newWeight = Math.min(10, Number(row.weight) + (input.weight_delta ?? 0.3));
    return sbPatch('axon_communication_signals', `id=eq.${row.id}`, {
      signal_value: input.signal_value,
      evidence_count: row.evidence_count + 1,
      weight: newWeight,
      last_reinforced_at: new Date().toISOString(),
    });
  }

  return sbInsert('axon_communication_signals', {
    operator_id: operatorId,
    signal_type: input.signal_type,
    signal_key: input.signal_key,
    signal_value: input.signal_value,
    evidence_count: 1,
    weight: input.weight_delta ?? 1,
  });
}

export async function fetchMemories(operatorId = OPERATOR_ID, limit = 30): Promise<AxonMemory[]> {
  const { sbSelect } = client();
  const rows = (await sbSelect(
    'axon_memories',
    `operator_id=eq.${operatorId}&select=*&order=created_at.desc&limit=${limit}`
  )) as AxonMemory[];
  return rows || [];
}

export async function insertMemory(input: {
  content: string;
  memory_type?: AxonMemory['memory_type'];
  confidence?: number;
  source_message_id?: string;
  operator_id?: string;
}) {
  const { sbInsert } = client();
  return sbInsert('axon_memories', {
    operator_id: input.operator_id || OPERATOR_ID,
    content: input.content,
    memory_type: input.memory_type || 'context',
    confidence: input.confidence ?? 0.6,
    source_message_id: input.source_message_id || null,
  });
}

export async function resetOperatorData(
  operatorId: string,
  scope: 'memories_before' | 'communication' | 'context' | 'full',
  beforeDate?: string
) {
  const key = getSupabaseKey();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  const base = 'https://kxijunwgbrlfzvgkhklo.supabase.co/rest/v1';

  async function del(table: string, filter: string) {
    const r = await fetch(`${base}/${table}?${filter}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=minimal' },
    });
    if (!r.ok) throw new Error(`Delete ${table}: HTTP ${r.status}`);
  }

  if (scope === 'memories_before' && beforeDate) {
    await del('axon_memories', `operator_id=eq.${operatorId}&created_at=lt.${beforeDate}`);
  } else if (scope === 'communication') {
    await del('axon_communication_signals', `operator_id=eq.${operatorId}`);
  } else if (scope === 'context') {
    await del('axon_memories', `operator_id=eq.${operatorId}`);
    await updateOperatorProfile(operatorId, {
      context_data: {},
      tone_preset: DEFAULT_TONE_PRESET as TonePreset,
    });
  } else if (scope === 'full') {
    await del('axon_chat_messages', `operator_id=eq.${operatorId}`);
    await del('axon_communication_signals', `operator_id=eq.${operatorId}`);
    await del('axon_memories', `operator_id=eq.${operatorId}`);
    await updateOperatorProfile(operatorId, {
      context_data: {},
      tone_preset: DEFAULT_TONE_PRESET as TonePreset,
    });
  }
}

export function buildToneInstructions(
  preset: TonePreset,
  signals: CommunicationSignal[],
  techniques?: Parameters<typeof buildCommSkillInstructions>[0],
  channel: 'chat' | 'voice' | 'telegram' = 'chat',
): string {
  const top = signals
    .filter((s) => s.weight >= 1.5)
    .slice(0, 12)
    .map((s) => `- [${s.signal_type}] ${s.signal_key}: ${s.signal_value} (evidence: ${s.evidence_count})`);

  const learned = preset.learned_patterns?.length
    ? `\nLearned patterns:\n${preset.learned_patterns.map((p) => `- ${p}`).join('\n')}`
    : '';

  const preferred = preset.preferred_phrases?.length
    ? `\nPhrases that resonate: ${preset.preferred_phrases.join(', ')}`
    : '';

  const avoid = preset.avoid_phrases?.length
    ? `\nAvoid: ${preset.avoid_phrases.join(', ')}`
    : '';

  const skillBlock = buildCommSkillInstructions(
    techniques?.length ? techniques : mergeTechniquesWithDefaults([]),
    { channel },
  );

  return `${skillBlock}

Tone preset: ${preset.summary || DEFAULT_TONE_PRESET.summary}
Warmth ${preset.warmth}, directness ${preset.directness}, formality ${preset.formality}, humor ${preset.humor}.
${top.length ? `\nEvidence-weighted communication signals:\n${top.join('\n')}` : ''}${learned}${preferred}${avoid}

Speak like a sharp, trusted human partner — not an AI assistant. Short sentences when directness is high. Match the operator's energy. Never say "As an AI" or use corporate filler.`;
}
