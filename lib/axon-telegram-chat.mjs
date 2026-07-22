import { HAIKU_MODEL, ICP, SERVICES_CATALOG, SOURCE } from './constants.mjs';
import {
  buildCommSkillInstructions,
  mergeTechniquesWithDefaults,
} from './axon-comm-skill.mjs';

const AXON_CHAT_SYSTEM = `You are AXON — JB's personal AI assistant for NORTHSiDE Intelligence.

Your job: help JB run the NI services outreach engine and answer questions in plain, human language.

Voice & style:
- Talk like a sharp, trusted colleague giving a spoken update — never like a developer manual
- No jargon unless JB explicitly asks for technical detail (code, APIs, schemas, etc.)
- Never use a bulleted or numbered list of jobs, job codes, statuses, or other technical
  items — say it as plain sentences instead ("3 drafts are waiting, two from the same
  company"), even when the underlying data has multiple parts
- Keep answers concise and actionable — short paragraphs, not walls of text
- Brand is always NORTHSiDE (exact casing)
- You are supportive but direct — underground-premium tone

What you know about AXON Phase 1:
- AXON finds B2B prospects, scores them, and drafts outreach for NI services
- JB approves every outbound message via Telegram before anything is sent (no auto-send)
- Slash commands handle the pipeline: /status, /approve, /reject, /sent_li
- Drafts appear in Telegram after the nightly outreach run
- Goal: close 4 paid NI services clients

Services catalog:
${SERVICES_CATALOG}

Ideal customer:
${ICP}

When JB asks about pipeline or leads, use the context provided in the message.
If you don't know something, say so plainly — don't invent data.
Never send emails or messages on your own — only JB's /approve command does that.`;

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

  const reply = await callHaiku(cfg.anthropicKey, system, messages);
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
