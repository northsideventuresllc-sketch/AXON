/**
 * TELEGRAM-CHAT-GROUNDED-0906 — when JB tells AXON to do something in his
 * private Telegram chat, it becomes a real ticket, not a promise.
 *
 * The 2026-09-06 incident ended with "I'll get back to you with a concrete
 * plan" and nothing created. Detection here is deliberately conservative: a
 * plain imperative ("fix the cron tab", "please add a filter") files one job;
 * a question, or a hedged "can you maybe…", gets one clarifying question back
 * instead of a speculative ticket.
 */

/** Owners the ticket table will accept. */
export const ROSTER = [
  'manager', 'runner', 'hermes', 'fable', 'PULSE', 'DESK', 'BUILD',
  'REACH', 'SENSEI', 'COUNCIL', 'ARCEUS', 'EXEC', 'CONTENT', 'OUTREACH',
];

const DEFAULT_OWNER = 'BUILD';

const IMPERATIVE_VERBS = [
  'add', 'build', 'change', 'check', 'clean', 'close', 'create', 'delete', 'deploy',
  'document', 'draft', 'file', 'find', 'fix', 'generate', 'hook', 'investigate',
  'kill', 'make', 'merge', 'move', 'open', 'plan', 'post', 'prepare', 'pull',
  'refactor', 'remove', 'rename', 'research', 'review', 'rewrite', 'run', 'schedule',
  'send', 'set', 'ship', 'start', 'stop', 'swap', 'switch', 'test', 'turn', 'update',
  'wire', 'write',
];

const QUESTION_OPENERS = /^(what|who|when|where|why|how|is|are|do|does|did|can|could|should|would|will|any|anything|has|have|am|was|were)\b/i;

const HEDGES = /\b(maybe|perhaps|not sure|thinking about|might want|wondering|at some point|eventually)\b/i;

/** Work that is a decision or a look-up rather than a change to the product. */
const QUESTION_WORK = /\b(find out|look into|investigate|research|check whether|check if|figure out|decide|compare|review)\b/i;

/**
 * Conservative classifier. Returns 'instruction', 'clarify' or 'chat'.
 */
export function classifyJbMessage(text) {
  const raw = String(text || '').trim();
  if (raw.length < 12) return 'chat';
  if (raw.startsWith('/')) return 'chat';

  const first = raw
    .replace(/^(hey|ok|okay|also|and|so)[,\s]+/i, '')
    .replace(/^(maybe|perhaps|possibly)[,\s]+/i, '');
  const please = /^please\b/i.test(first);
  const body = please ? first.replace(/^please\b[,\s]*/i, '') : first;
  const firstWord = (body.match(/^[a-z']+/i) || [''])[0].toLowerCase();
  const isVerbStart = IMPERATIVE_VERBS.includes(firstWord);
  const namesWork = IMPERATIVE_VERBS.some((v) => new RegExp(`\\b${v}\\b`, 'i').test(raw));

  // "Can you fix the cron tab?" is a request wearing a question mark — worth one
  // question back, never a ticket filed off a guess.
  if (/^(can|could|would|will|should)\s+(you|we)\b/i.test(first) && namesWork) return 'clarify';
  if (!please && !isVerbStart) return namesWork && HEDGES.test(raw) ? 'clarify' : 'chat';
  if (HEDGES.test(raw)) return 'clarify';
  // "Fix the cron tab?" is JB checking, not ordering.
  if (raw.includes('?')) return 'clarify';
  if (!please && QUESTION_OPENERS.test(firstWord)) return 'clarify';
  return 'instruction';
}

export function pickOwner(text) {
  const raw = String(text || '');
  for (const name of ROSTER) {
    if (name === name.toUpperCase() && new RegExp(`\\b${name}\\b`).test(raw)) return name;
  }
  for (const name of ROSTER) {
    if (name !== name.toUpperCase() && new RegExp(`\\b${name}\\b`, 'i').test(raw)) return name;
  }
  return DEFAULT_OWNER;
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-')
    .slice(0, 40) || 'note';
}

function stamp(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

/**
 * Builds the ticket row. verification_spec is human_only with a real reason —
 * that shape is what the spec gate accepts on a queued row, and it keeps the
 * owner honest: whoever claims it writes the real check.
 */
export function buildDispatchRow(text, { now = new Date(), owner = null } = {}) {
  const words = String(text || '').trim().replace(/\s+/g, ' ');
  const chosen = owner || pickOwner(words);
  const actionClass = QUESTION_WORK.test(words) ? 'question' : 'code';
  return {
    code: `TG-${stamp(now)}-${slugify(words)}`,
    title: `${words.slice(0, 400)} — JB said this in his Telegram chat; ${chosen} scopes and does it.`,
    owner: chosen,
    status: 'queued',
    action_class: actionClass,
    verification_spec: {
      type: 'human_only',
      params: { reason: 'JB asked for this in Telegram; owner writes the real spec on claim' },
    },
    source: 'JB via Telegram private chat',
    queued_by: 'jb',
  };
}

export const CLARIFY_REPLY =
  'Before I put that in the queue — do you want it done now, or are you thinking out loud? Say "do it" and I will file it.';

/**
 * Two messages on the same day that open with the same few words would build
 * the same name and collide, losing the second job. Take the next free one.
 */
export async function freeCode(sbSelect, base, { maxTries = 20 } = {}) {
  if (typeof sbSelect !== 'function') return base;
  for (let n = 1; n <= maxTries; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    try {
      const rows = await sbSelect(
        'agent_dispatch',
        `select=code&code=eq.${encodeURIComponent(candidate)}&limit=1`,
      );
      if (!rows || rows.length === 0) return candidate;
    } catch {
      return candidate; // a failed look-up must not swallow JB's instruction
    }
  }
  return `${base}-${Date.now()}`;
}

/** Files one ticket and returns the plain reply JB sees. */
export async function fileJbInstruction(sbInsert, text, { now = new Date(), sbSelect = null } = {}) {
  const row = buildDispatchRow(text, { now });
  row.code = await freeCode(sbSelect, row.code);
  await sbInsert('agent_dispatch', row);
  return { row, reply: `Filed for ${row.owner}. ${row.owner} picks it up on the next pass.` };
}
