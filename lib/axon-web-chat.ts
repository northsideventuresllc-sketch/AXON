import { HAIKU_MODEL } from './constants.mjs';
import { loadConfig } from './config.mjs';
import {
  buildToneInstructions,
  fetchMemories,
  fetchTopSignals,
  getOperatorProfile,
  insertChatMessage,
  insertMemory,
  updateOperatorProfile,
  upsertSignal,
} from './axon-profile';
import type { ChatMessage, TonePreset } from './axon-types';
import { createSupabaseClient } from './supabase.mjs';

async function callHaiku(apiKey: string, system: string, messages: { role: string; content: string }[]) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 900,
      system,
      messages,
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.map((c: { text?: string }) => c.text || '').join('').trim();
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

export async function generateAxonReply(
  userMessage: string,
  channel: 'chat' | 'voice',
  history: ChatMessage[]
) {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const { sbSelect } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);

  const [profile, signals, memories] = await Promise.all([
    getOperatorProfile(),
    fetchTopSignals(),
    fetchMemories(undefined, 15),
  ]);

  const toneBlock = buildToneInstructions(profile.tone_preset, signals);
  const memoryBlock = memories.length
    ? `\nOperator context you remember:\n${memories.map((m) => `- (${m.memory_type}) ${m.content}`).join('\n')}`
    : '';

  const system = `You are AXON — NORTHSiDE Intelligence's autonomous partner. Sector 5. Underground-premium voice.

You help the operator run autonomous profit engines, review outreach, and make decisions. You grow WITH the operator — adapting tone from every interaction.

${toneBlock}
${memoryBlock}

${channel === 'voice' ? 'This is a voice conversation. Keep responses concise (2-4 sentences unless detail is requested). Sound natural when spoken aloud.' : 'This is text chat. Be conversational and human — not bullet-heavy unless listing data.'}

Brand: NORTHSiDE (exact casing). Never auto-send outreach. Phase 1 goal: close 4 paid NI Services clients.`;

  const recent = history.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const reply = await callHaiku(cfg.anthropicKey, system, [
    ...recent,
    { role: 'user', content: userMessage },
  ]);

  const userMsg = await insertChatMessage({
    role: 'user',
    content: userMessage,
    channel,
  });

  const assistantMsg = await insertChatMessage({
    role: 'assistant',
    content: reply,
    channel,
    metadata: { signal_count: signals.length },
  });

  // Fire-and-forget learning analysis (don't block response)
  analyzeAndLearn(cfg.anthropicKey, userMessage, reply, profile.tone_preset).catch(console.error);

  return { reply, userMsg, assistantMsg };
}

async function analyzeAndLearn(
  apiKey: string,
  userMessage: string,
  assistantReply: string,
  currentPreset: TonePreset
) {
  const system = `You analyze operator↔AXON conversations to extract communication learnings. Return JSON only.

Extract signals that help AXON match how THIS operator talks and what responses work.
Weight higher when the user message shows engagement (questions, follow-ups, approval words like "good", "yes", "perfect", "do that").
Return at most 5 signals and at most 2 memories.`;

  const user = `User: ${userMessage}
AXON: ${assistantReply}
Current tone: ${JSON.stringify(currentPreset)}

Return JSON:
{
  "signals": [
    { "signal_type": "tone|phrasing|preference|interpretation|response_pattern|vocabulary", "signal_key": "short_key", "signal_value": "what to do", "weight_delta": 0.2-0.8 }
  ],
  "memories": [
    { "content": "fact about operator", "memory_type": "fact|preference|context|relationship", "confidence": 0.3-0.9 }
  ],
  "tone_adjustments": {
    "warmth": -0.1 to 0.1 or 0,
    "directness": -0.1 to 0.1 or 0,
    "formality": -0.1 to 0.1 or 0,
    "humor": -0.1 to 0.1 or 0,
    "learned_pattern": "optional one-line pattern",
    "preferred_phrase": "optional phrase operator liked",
    "avoid_phrase": "optional phrase to avoid"
  }
}`;

  let parsed;
  try {
    const text = await callHaiku(apiKey, system, [{ role: 'user', content: user }]);
    parsed = extractJson(text);
  } catch {
    return;
  }

  for (const sig of parsed.signals || []) {
    if (!sig.signal_key || !sig.signal_value) continue;
    await upsertSignal({
      signal_type: sig.signal_type,
      signal_key: sig.signal_key,
      signal_value: sig.signal_value,
      weight_delta: sig.weight_delta ?? 0.3,
    });
  }

  for (const mem of parsed.memories || []) {
    if (!mem.content) continue;
    await insertMemory({
      content: mem.content,
      memory_type: mem.memory_type,
      confidence: mem.confidence,
    });
  }

  const adj = parsed.tone_adjustments;
  if (adj) {
    const clamp = (v: number, base: number) => Math.max(0, Math.min(1, base + (v || 0)));
    const next: TonePreset = {
      ...currentPreset,
      warmth: clamp(adj.warmth, currentPreset.warmth),
      directness: clamp(adj.directness, currentPreset.directness),
      formality: clamp(adj.formality, currentPreset.formality),
      humor: clamp(adj.humor, currentPreset.humor),
      learned_patterns: currentPreset.learned_patterns || [],
      preferred_phrases: currentPreset.preferred_phrases || [],
      avoid_phrases: currentPreset.avoid_phrases || [],
    };

    if (adj.learned_pattern && !next.learned_patterns!.includes(adj.learned_pattern)) {
      next.learned_patterns = [...next.learned_patterns!.slice(-9), adj.learned_pattern];
    }
    if (adj.preferred_phrase && !next.preferred_phrases!.includes(adj.preferred_phrase)) {
      next.preferred_phrases = [...next.preferred_phrases!.slice(-9), adj.preferred_phrase];
    }
    if (adj.avoid_phrase && !next.avoid_phrases!.includes(adj.avoid_phrase)) {
      next.avoid_phrases = [...next.avoid_phrases!.slice(-9), adj.avoid_phrase];
    }

    await updateOperatorProfile('default', { tone_preset: next });
  }
}

/** Background job: re-synthesize tone preset from top signals (fast pattern infusion) */
export async function refreshTonePresetFromSignals() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const { sbSelect } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);

  const [profile, signals] = await Promise.all([getOperatorProfile(), fetchTopSignals(undefined, 15)]);
  if (signals.length < 3) return profile.tone_preset;

  const system = `Synthesize an updated tone preset JSON from communication signals. Return JSON only.`;
  const user = `Signals:\n${JSON.stringify(signals.slice(0, 10), null, 2)}\nCurrent:\n${JSON.stringify(profile.tone_preset)}\n\nReturn: { "style", "warmth", "directness", "formality", "humor", "summary", "learned_patterns", "preferred_phrases", "avoid_phrases" }`;

  try {
    const text = await callHaiku(cfg.anthropicKey, system, [{ role: 'user', content: user }]);
    const next = extractJson(text) as TonePreset;
    await updateOperatorProfile('default', { tone_preset: next });
    return next;
  } catch {
    return profile.tone_preset;
  }
}
