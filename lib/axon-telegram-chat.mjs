import { HAIKU_MODEL, GEMINI_MODEL, ICP, SERVICES_CATALOG, SOURCE } from './constants.mjs';
import {
  buildCommSkillInstructions,
  mergeTechniquesWithDefaults,
} from './axon-comm-skill.mjs';
import { callAxonLocal } from './axon-local-relay.mjs';
import { callAxonV1Cloud } from './axon-v1-cloud-relay.mjs';

const AXON_CHAT_SYSTEM = `You are AXON's Outreach Assistant — one specific, narrow-scope part of Northside Ventures Group's agent fleet, talking to JB in this one Telegram thread.

IDENTITY (say this plainly if JB ever asks who/what he's talking to, or seems unsure): "I'm the AXON Outreach Assistant — I only handle the NI services outreach pipeline (leads, drafts, /approve /reject /status) and content-machine commands in this chat. I'm not ARCEUS, EXEC, PULSE, SENSEI, or BUILD — those are separate agents that don't post into this specific chat thread and I have no access to what they're doing." Every reply you send is automatically prefixed with [AXON — Outreach] so JB can tell it apart from anything else that might land in this same Telegram conversation.

Your job: help JB run the NI services outreach engine and answer questions about IT SPECIFICALLY, in plain, human language.

HARD SCOPE LIMIT (this is the most important rule — read it before anything else): you have NO real data and NO real access to anything outside the outreach-lead pipeline and content-machine described below. You do not know the fleet's health, which agents are running, what any agent built, DB schema/table state outside ni_brain_outreach, credentials, permissions, git/repo state, or infrastructure of any kind. If JB asks about any of that — another agent by name, "is X working", fleet status, permissions/access changes, code, deployments, anything technical outside this outreach pipeline — do NOT attempt an answer, even a hedged one, and do NOT guess or extrapolate from what you do know. Say plainly: "That's outside what I can see from here — that needs ARCEUS or EXEC directly, not this chat." Then stop. A short, honest "I can't help with that here" is always correct; a guess dressed up as an answer is never correct, no matter how plausible it sounds.

Voice & style:
- Talk like a sharp, trusted colleague giving a spoken update — never like a developer manual
- No jargon unless JB explicitly asks for technical detail (code, APIs, schemas, etc.)
- Never use a bulleted or numbered list of jobs, job codes, statuses, or other technical
  items — say it as plain sentences instead ("3 drafts are waiting, two from the same
  company"), even when the underlying data has multiple parts
- Keep answers concise and actionable — short paragraphs, not walls of text
- Brand: Northside — standard title case (use NORTHSIDE only in intentional all-caps design contexts)
- You are supportive but direct — underground-premium tone

What you know about AXON Phase 1 — and ONLY this:
- AXON finds B2B prospects, scores them, and drafts outreach for NI services
- JB approves every outbound message via Telegram before anything is sent (no auto-send)
- Slash commands handle the pipeline: /status, /approve, /reject, /sent_li
- Drafts appear in Telegram after the nightly outreach run
- Goal: close 4 paid NI services clients

Services catalog:
${SERVICES_CATALOG}

Ideal customer:
${ICP}

When JB asks about pipeline or leads, use the context provided in the message — never anything you're not handed directly.
If you don't know something, or it's outside the scope above, say so plainly — don't invent data, don't guess, don't answer "as if" you knew.
Never send emails or messages on your own — only JB's /approve command does that.`;

// FLEET-OPS-REDIRECT (2026-08-27, JB direct order — "it doesn't listen to me, it
// hallucinates, I have no idea what agent I'm talking to"): a deterministic
// pre-check, checked BEFORE any model call. Root cause of the hallucination
// complaint — free-text fell straight into an LLM chat completion with a system
// prompt that only knows the outreach pipeline, so any question about another
// agent or fleet/infra state got a confident, made-up answer instead of an
// honest "I don't know." This catches the obvious cases with a fixed, correct
// answer instead of hoping every model tier in the fallback cascade (including
// the weakest, AXON-local) reliably follows a "don't guess" instruction.
const FLEET_OPS_PATTERN =
  /\b(arceus|exec|pulse|sensei|build agent|pr sweep|council|outreach agent|nvg weekend|brain\s*&?\s*fleet auditor|weekly self reflection|agent_bus|nvg_agent|trigger|deploy|merge (to )?main|repo access|git access|permission|credential|api key|scheduled task|cron job)\b/i;

export function isFleetOpsQuestion(text) {
  if (!text) return false;
  return FLEET_OPS_PATTERN.test(text);
}

const FLEET_OPS_REDIRECT =
  "That's outside what I can see from here — I'm the AXON Outreach Assistant, I only handle the NI outreach pipeline in this chat. For anything about other agents, permissions, deploys, or fleet health, that needs ARCEUS or EXEC directly (Cowork chat or #agent-ops in Slack), not this Telegram thread. I don't have access to any of that, so I'm not going to guess.";

// GEMINI_MODEL now imported from constants.mjs. Was hardcoded gemini-2.0-flash (retired, 404, silently swallowed) which killed the Gemini tier and fell Telegram through to the broke Anthropic key.

async function callHaiku(apiKey, system, messages, maxTokens = 900) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.map((c) => c.text || '').join('').trim();
}

async function callGeminiOnce(apiKey, system, messages, maxTokens) {
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
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
      }),
    },
  );
  if (!r.ok) return null;
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('')?.trim();
  return text || null;
}

/**
 * AXON-EVERYWHERE-PROJECT (2026-08-05): AXON-local first (JB's Telegram interface to
 * AXON), then free-tier Gemini, then paid Haiku last resort. Decision #598 item 11 / #619.
 *
 * AXON-TIER-SYSTEM (2026-08-20, JB direct order): RunPod (AXON v1) tier inserted right
 * after AXON-local and before Gemini, per the canonical org-wide tier order. No-op
 * (returns null, falls through) until RunPod is deployed.
 */
async function callChatModel(cfg, system, messages, maxTokens = 900) {
  const local = await callAxonLocal(cfg.supabaseKey, system, messages).catch(() => null);
  if (local) return local;

  const runpod = await callAxonV1Cloud(cfg.supabaseKey, system, messages).catch(() => null);
  if (runpod) return runpod;

  for (const key of [cfg.geminiKey, cfg.geminiBackup].filter(Boolean)) {
    try {
      const text = await callGeminiOnce(key, system, messages, maxTokens);
      if (text) return text;
    } catch {
      // try next key / fall through to Haiku
    }
  }
  return callHaiku(cfg.anthropicKey, system, messages, maxTokens);
}

export function wantsTechnicalDetail(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    /\b(code|api|schema|sql|json|debug|stack trace|implementation|technical|jargon)\b/.test(lower) ||
    /\b(show me the|how does .+ work under the hood)\b/.test(lower)
  );
}

/**
 * Load AX-COMM-SKILL techniques when sbSelect is available; else defaults.
 * @param {((table: string, filter?: string) => Promise<unknown>) | null | undefined} sbSelect
 */
export async function loadCommSkillBlock(sbSelect) {
  let rows = [];
  if (typeof sbSelect === 'function') {
    try {
      rows = await sbSelect('axon_communication_profile', 'select=*&order=weight.desc');
    } catch {
      rows = [];
    }
  }
  const techniques = mergeTechniquesWithDefaults(rows || []);
  return buildCommSkillInstructions(techniques, { channel: 'telegram' });
}

export async function axonChatReply(cfg, { userMessage, history = [], pipelineContext = '', sbSelect = null }) {
  if (isFleetOpsQuestion(userMessage)) return FLEET_OPS_REDIRECT;

  const technical = wantsTechnicalDetail(userMessage);
  const skillBlock = await loadCommSkillBlock(sbSelect);
  const system = technical
    ? `${AXON_CHAT_SYSTEM}\n\n${skillBlock}\n\nJB asked for technical detail — you may use precise technical language.`
    : `${AXON_CHAT_SYSTEM}\n\n${skillBlock}`;

  const contextBlock = pipelineContext
    ? `\n\nCurrent pipeline snapshot:\n${pipelineContext}`
    : '';

  const messages = [
    ...history.slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    {
      role: 'user',
      content: `${userMessage}${contextBlock}`,
    },
  ];

  const reply = await callChatModel(cfg, system, messages);
  return reply.slice(0, 4000);
}

export async function buildPipelineContext(sbSelect) {
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&select=status,handle&order=created_at.desc&limit=100`
  );
  const counts = {};
  for (const r of rows || []) {
    const s = r.status || 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  }
  const pending = counts.pending_approval || 0;
  const recent = (rows || [])
    .filter((r) => r.status === 'pending_approval')
    .slice(0, 5)
    .map((r) => r.handle)
    .join(', ');
  const other = Object.entries(counts)
    .filter(([status]) => status !== 'pending_approval' && status !== 'closed_won')
    .reduce((sum, [, n]) => sum + n, 0);

  return [
    `Total leads: ${rows?.length || 0}`,
    `Waiting for your approval: ${pending}`,
    `Closed won: ${counts.closed_won || 0} of 4 goal`,
    recent ? `Recent pending: ${recent}` : 'No drafts waiting right now.',
    `Everything else in progress or wrapped up: ${other}`,
  ].join('\n');
}
