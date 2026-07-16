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
import {
  applyBriefingUpdates,
  applyTodoUpdates,
  formatWorkspaceForPrompt,
  getWorkspace,
  setWorkspaceFlags,
} from './axon-workspace';
import { loadJspacePromptBlock } from './axon-j-space';
import { loadWisdomPromptBlock } from './axon-wisdom';
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
  history: ChatMessage[],
  sessionId?: string,
  notificationContext?: {
    title: string;
    source: string;
    body?: string;
    prompt?: string;
  }
) {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const { sbSelect } = createSupabaseClient(key);
  const cfg = await loadConfig(sbSelect);

  const [profile, signals, memories, workspace, jspaceBlock, wisdomBlock] = await Promise.all([
    getOperatorProfile(),
    fetchTopSignals(),
    fetchMemories(undefined, 15),
    getWorkspace(),
    loadJspacePromptBlock(),
    loadWisdomPromptBlock(),
  ]);

  const toneBlock = buildToneInstructions(profile.tone_preset, signals);
  const memoryBlock = memories.length
    ? `\nOperator context you remember:\n${memories.map((m) => `- (${m.memory_type}) ${m.content}`).join('\n')}`
    : '';
  const workspaceBlock = `\n${formatWorkspaceForPrompt(workspace)}`;

  const notificationBlock = notificationContext
    ? `\n\nACTIVE NOTIFICATION CONTEXT:
Source: ${notificationContext.source}
Title: ${notificationContext.title}
${notificationContext.body ? `Details: ${notificationContext.body}` : ''}
${notificationContext.prompt ? `Suggested action: ${notificationContext.prompt}` : ''}

Help the operator understand and resolve this notification through conversation. When they confirm the action is complete or they've decided not to act, acknowledge clearly.`
    : '';

  const system = `You are AXON — Northside Intelligence's State of the Art Personalized Agentic Assistant. Underground-premium voice.

You help the operator run autonomous profit engines, review outreach, and make decisions. You grow WITH the operator — adapting tone from every interaction.

You manage the operator's briefing panel and to-do list. When they ask to set up a briefing, add tasks, mark items complete, or enable autonomous management — confirm in your reply and the system will apply updates automatically.

You operate a J-Space global workspace analogue: route high-order reasoning through active concepts before execution. Autonomous research runs 4x/week and surfaces findings in daily briefs.

${toneBlock}
${memoryBlock}
${workspaceBlock}
${jspaceBlock}${wisdomBlock}${notificationBlock}

${channel === 'voice' ? 'This is a voice conversation. Keep responses concise (2-4 sentences unless detail is requested). Sound natural when spoken aloud.' : 'This is text chat. Be conversational and human — not bullet-heavy unless listing data.'}

Brand: Northside Intelligence / NORTHSiDE (exact casing when using the brand name). Never auto-send outreach. Phase 1 goal: close 4 paid NI Services clients.`;

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
    session_id: sessionId,
  });

  const assistantMsg = await insertChatMessage({
    role: 'assistant',
    content: reply,
    channel,
    session_id: sessionId,
    metadata: { signal_count: signals.length },
  });

  // Learning + workspace updates — await so UI gets fresh briefing/todos
  let updatedWorkspace = workspace;
  try {
    updatedWorkspace =
      (await analyzeAndLearn(
        cfg.anthropicKey,
        userMessage,
        reply,
        profile.tone_preset,
        workspace
      )) ?? workspace;
  } catch (err) {
    console.error(err);
  }

  return { reply, userMsg, assistantMsg, workspace: updatedWorkspace };
}

async function analyzeAndLearn(
  apiKey: string,
  userMessage: string,
  assistantReply: string,
  currentPreset: TonePreset,
  currentWorkspace: Awaited<ReturnType<typeof getWorkspace>>
) {
  const system = `You analyze operator↔AXON conversations to extract communication learnings and workspace updates. Return JSON only.

Extract signals that help AXON match how THIS operator talks and what responses work.
When the user asks about briefings, to-dos, tasks, priorities, or daily planning — emit briefing_updates and/or todo_updates.
Enable autonomous mode when the user asks AXON to manage briefing or todos automatically over time.
Return at most 5 signals, at most 2 memories, at most 4 briefing updates, at most 5 todo updates.`;

  const user = `User: ${userMessage}
AXON: ${assistantReply}
Current tone: ${JSON.stringify(currentPreset)}
Current workspace: ${JSON.stringify(currentWorkspace)}

Return JSON:
{
  "signals": [
    { "signal_type": "tone|phrasing|preference|interpretation|response_pattern|vocabulary", "signal_key": "short_key", "signal_value": "what to do", "weight_delta": 0.2-0.8 }
  ],
  "memories": [
    { "content": "fact about operator", "memory_type": "fact|preference|context|relationship", "confidence": 0.3-0.9 }
  ],
  "briefing_updates": [
    { "action": "add|update|remove", "id": "optional existing id", "title": "headline", "content": "detail", "priority": "high|medium|low" }
  ],
  "todo_updates": [
    { "action": "add|update|remove|complete", "id": "optional existing id", "text": "task text", "done": false }
  ],
  "workspace_flags": {
    "briefing_autonomous": true,
    "todos_autonomous": true
  },
  "tone_adjustments": {
    "warmth": 0,
    "directness": 0,
    "formality": 0,
    "humor": 0,
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
    return currentWorkspace;
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

  let workspace = currentWorkspace;

  if (parsed.briefing_updates?.length) {
    workspace = await applyBriefingUpdates(parsed.briefing_updates);
  }

  if (parsed.todo_updates?.length) {
    workspace = await applyTodoUpdates(parsed.todo_updates);
  }

  const flags = parsed.workspace_flags;
  if (flags && (flags.briefing_autonomous !== undefined || flags.todos_autonomous !== undefined)) {
    workspace = await setWorkspaceFlags({
      briefing_autonomous: flags.briefing_autonomous,
      todos_autonomous: flags.todos_autonomous,
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

  return workspace;
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
