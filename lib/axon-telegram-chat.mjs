import { ICP, SERVICES_CATALOG, SOURCE } from './constants.mjs';
import {
  buildCommSkillInstructions,
  mergeTechniquesWithDefaults,
} from './axon-comm-skill.mjs';
import { generateViaRouter } from './axon-generate.mjs';

const AXON_CHAT_SYSTEM = `You are AXON — the voice of Northside's agent fleet in JB's private Telegram chat. Not a narrow outreach helper: this chat is where JB talks to AXON about anything the fleet is doing. Speak as "AXON". Never prefix or sign your replies with a tag.

WHAT YOU CAN SEE: every message you answer arrives with a CONTEXT section read live from the brain a moment ago — tasks that name JB, approvals sent to this chat with no answer yet, agents not reporting healthy, the newest close-out note, and the outreach pipeline. That section is the whole of what you know.

GROUNDING — the hard rules, above everything else below:
- Answer ONLY from the CONTEXT section. Nothing else exists to you.
- Earlier messages in this chat are NOT evidence — not even your own. They show what was said, never what is true. Never repeat a task, number, name or status from earlier in the chat unless it also appears in CONTEXT right now; if it is not there, say you do not have it in front of you.
- If the answer is not there, reply exactly: "I don't have that in front of me" — then name where it lives in plain words (which agent, or which screen). Nothing more.
- Never invent a task, a draft, a root cause, a plan, a number or a status. A plausible-sounding answer with nothing behind it is the worst thing you can send.
- Never agree with a claim you cannot see in the context. If JB says something you cannot confirm, say what you CAN see instead, plainly.
- No apologies, no "that's on me", no "you're right", no "thanks for the reality check", no promising a plan for later. Say what is true now.
- Do not describe your own process or the tools you used.

STYLE:
- First line answers the question. Nothing before it.
- Short plain sentences, the way a trusted colleague speaks. No jargon, no job codes, no table or file names, no status keys.
- Plain text only — this chat does not render markdown, so never use asterisks, bullets or numbered lists. Multiple items go on their own short lines as sentences.
- Brand: Northside, standard title case. Operator: JB.

WHAT YOU DO HERE:
- Answer JB's questions about what is waiting on him, what the fleet is doing, and the outreach pipeline — from the context, every time.
- Keep running the outreach engine through its commands (/status, /approve, /reject, /sent_li) and the content commands. JB approves every outbound message; nothing is ever sent on your own.
- When JB tells you to do something, it is filed as a real job for the owning agent — never answered with a promise.

Services catalog:
${SERVICES_CATALOG}

Ideal customer:
${ICP}`;

/**
 * ONE ROUTER (2026-09-06): every Telegram reply walks the single locked chain in
 * lib/axon-router-core.mjs — local (Mac mini) -> RunPod -> OpenRouter free ->
 * Gemini -> Anthropic last. The four hand-rolled tiers that used to live in this
 * file (each with its own model-id drift) are gone; free stays first and paid
 * stays last because that order lives in the router, not here. The reply is
 * still trimmed to Telegram's limit by axonChatReply below.
 */
async function callChatModel(cfg, system, messages, generate = generateViaRouter) {
  const out = await generate(cfg.supabaseKey, {
    messages: [{ role: 'system', content: system }, ...messages],
    kind: 'cheap_chat',
    agentName: 'axon-telegram-outreach',
    maxTokens: 900,
  });
  return out.text;
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

/**
 * GROUNDED (2026-09-06): `context` is the labelled live snapshot built by
 * buildJbChatContext — tasks naming JB, unanswered approvals, unhealthy agents,
 * the last close-out, the outreach pipeline. It is handed to the model as the
 * only source it may answer from. `pipelineContext` stays supported on its own
 * for the outreach-only callers that predate this.
 */
/**
 * Turns before this moment include the 2026-09-06 replies that invented three
 * items out of nothing. They stay in the log as a record, but they are never
 * fed back to the model as if they were fact.
 */
export const FIX_CUTOFF_ISO = '2026-09-07T00:00:00Z';

/** Last few turns only, and no assistant turn from before the fix shipped. */
export function usableHistory(history = [], { cutoff = FIX_CUTOFF_ISO, turns = 6 } = {}) {
  const cut = new Date(cutoff).getTime();
  return history
    .filter((m) => {
      if (m.role !== 'assistant') return true;
      const at = new Date(m.created_at || 0).getTime();
      return Number.isFinite(at) && at >= cut;
    })
    .slice(-turns);
}

export async function axonChatReply(
  cfg,
  { userMessage, history = [], context = '', pipelineContext = '', sbSelect = null, generate = generateViaRouter },
) {
  const technical = wantsTechnicalDetail(userMessage);
  const skillBlock = await loadCommSkillBlock(sbSelect);
  const system = technical
    ? `${AXON_CHAT_SYSTEM}\n\n${skillBlock}\n\nJB asked for technical detail — you may use precise technical language.`
    : `${AXON_CHAT_SYSTEM}\n\n${skillBlock}`;

  const snapshot = context || (pipelineContext ? `OUTREACH PIPELINE:\n${pipelineContext}` : '');
  const contextBlock = snapshot
    ? `\n\nCONTEXT — read from the brain just now. Answer only from this and our conversation:\n${snapshot}`
    : '\n\nCONTEXT — nothing came back this time. Say you do not have it in front of you.';

  const messages = [
    ...usableHistory(history).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    {
      role: 'user',
      content: `${userMessage}${contextBlock}`,
    },
  ];

  const reply = await callChatModel(cfg, system, messages, generate);
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
