import { HAIKU_MODEL, GEMINI_MODEL } from './constants.mjs';
import { loadConfig } from './config.mjs';
import {
  buildToneInstructions,
  fetchCommunicationTechniques,
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
import { callAxonLocal } from './axon-local-relay.mjs';
import { callAxonV1Cloud } from './axon-v1-cloud-relay.mjs';

// GEMINI_MODEL now imported from constants.mjs (retired model removed - same root cause as Telegram path).

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

async function callGeminiOnce(
  apiKey: string,
  system: string,
  messages: { role: string; content: string }[],
): Promise<string | null> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 900, temperature: 0.6 },
      }),
    },
  );
  if (!r.ok) return null;
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text)
    .join('')
    ?.trim();
  return text || null;
}

/**
 * AXON-EVERYWHERE-PROJECT (2026-08-05): AXON-local first, then free-tier Gemini,
 * then paid Haiku only as the last resort — per JB directive DW-LOCAL-MODEL-MIGRATION
 * and the locked tier order (Decision #598 item 11 / #619). callHaiku and the Gemini
 * calls below are unchanged; AXON-local is a new attempt prepended so behavior never
 * regresses below what shipped before this change whenever it fails/times out.
 * Same call shape as callHaiku so existing call sites need only add geminiKey/geminiBackup.
 *
 * AXON-TIER-SYSTEM (2026-08-20, JB direct order): RunPod (AXON v1) tier inserted right
 * after AXON-local and before Gemini, per the canonical org-wide tier order. callAxonV1Cloud
 * is a documented no-op (returns null) until RunPod is deployed, so this is a no-op change
 * until then.
 */
/**
 * Narrow view of what lib/axon-router returns. The walker is untyped .mjs and
 * infers a wide union across its success and failure branches, so this names
 * only the fields this call site reads. Success is identified by `ok`.
 */
type RoutedReply = {
  ok?: boolean;
  status?: string;
  text?: string;
  route?: string;
  model?: string;
  servedTier?: string | null;
  requestedTier?: string | null;
  degraded?: boolean;
};

async function callChatModel(
  keys: { anthropicKey: string; geminiKey?: string; geminiBackup?: string; supabaseKey?: string },
  system: string,
  messages: { role: string; content: string }[],
): Promise<string> {
  // AXON-ROUTER (2026-08-28): the multi-route router replaces the hardcoded tier
  // chain below. It walks (route, model) pairs from NI-Brain ordered by capability
  // tier then priority, classifies each failure as transient or terminal, writes
  // health/backoff, and falls to the local floor as a last resort. See
  // docs/axon-router-spec.md and manage routes at /tools/router.
  //
  // Rollback: set AXON_ROUTER_DISABLED=1 and restart — the original chain below
  // runs verbatim. It is deliberately left intact rather than deleted, and also
  // acts as a backstop if the router itself throws (bad import, DB unreachable).
  if (process.env.AXON_ROUTER_DISABLED !== '1') {
    try {
      const { walk } = await import('./axon-router/index.mjs');
      // Adapters take a single rendered prompt (spec §1), so flatten the turns.
      const prompt = messages
        .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
        .join('\n\n');
      // No requiredTier: resolves to `capable`, which keeps the step-7 last
      // resort available. Passing a tier explicitly would disable it.
      const routed = (await walk({
        payload: { prompt, systemPrompt: system, maxTokens: 2000 },
      })) as RoutedReply;
      if (routed?.ok && routed.text) {
        if (routed.degraded) {
          console.warn(
            `[axon-router] degraded reply: served ${routed.servedTier} ` +
              `(wanted ${routed.requestedTier}) via ${routed.route}/${routed.model}`,
          );
        }
        return routed.text;
      }
      console.warn(
        `[axon-router] no route answered (${routed?.status ?? 'unknown'}) — ` +
          'falling back to the legacy tier chain',
      );
    } catch (err) {
      console.warn(
        '[axon-router] router threw, falling back to legacy chain:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ---- legacy tier chain (rollback path / backstop) ----
  const local = await callAxonLocal(keys.supabaseKey ?? '', system, messages).catch(() => null);
  if (local) return local;

  const runpod = await callAxonV1Cloud(keys.supabaseKey ?? '', system, messages).catch(() => null);
  if (runpod) return runpod;

  for (const key of [keys.geminiKey, keys.geminiBackup].filter((k): k is string => Boolean(k))) {
    try {
      const text = await callGeminiOnce(key, system, messages);
      if (text) return text;
    } catch {
      // try next key / fall through to Haiku
    }
  }
  return callHaiku(keys.anthropicKey, system, messages);
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

  const [profile, signals, memories, workspace, jspaceBlock, techniques, wisdomBlock] =
    await Promise.all([
      getOperatorProfile(),
      fetchTopSignals(),
      fetchMemories(undefined, 15),
      getWorkspace(),
      loadJspacePromptBlock(),
      fetchCommunicationTechniques(),
      loadWisdomPromptBlock(),
    ]);

  const toneBlock = buildToneInstructions(profile.tone_preset, signals, techniques, channel);
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

Brand: Northside Intelligence — standard title case (use NORTHSIDE only in intentional all-caps design contexts). Never auto-send outreach. Phase 1 goal: close 4 paid NI Services clients.`;

  const recent = history.slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const reply = await callChatModel(cfg, system, [
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
        cfg,
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
  cfg: { anthropicKey: string; geminiKey?: string; geminiBackup?: string },
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
    const text = await callChatModel(cfg, system, [{ role: 'user', content: user }]);
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
    const text = await callChatModel(cfg, system, [{ role: 'user', content: user }]);
    const next = extractJson(text) as TonePreset;
    await updateOperatorProfile('default', { tone_preset: next });
    return next;
  } catch {
    return profile.tone_preset;
  }
}
