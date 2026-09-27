/**
 * P2-ACK — JB must ALWAYS know his Telegram answer got through.
 *
 * Shared building blocks for the approval-card confirmation paths:
 *   - button tap on an approval card (nvg-approve-telegram.mjs)
 *   - typed reply to an approval card (telegram-approval-reply.mjs)
 *   - any other typed message (telegram-handler.mjs)
 *
 * Every string JB can see on those paths lives in JB_TEXT below so one test
 * (tests/telegram-jb-receipts.test.mjs) can lint all of them for jargon, per
 * the global rule R-JB-QUESTION-BOX / Decision #2013 (boxes, no jargon).
 * Receipts are drawn as a monospace box inside <pre>, so every message on
 * these paths is sent with parse_mode HTML and all dynamic text is escaped.
 */

/** Every fixed, user-visible string on the confirmation paths. Plain English only. */
export const JB_TEXT = Object.freeze({
  gotIt: '✅ GOT IT',
  gotReply: '✅ GOT YOUR REPLY',
  failed: "❌ That didn't go through. Tap again.",
  failedShort: "❌ That didn't go through.",
  tapAgain: 'Tap again.',
  notAuthorized: "Sorry, you can't answer this card from here.",
  unreadableButton: "Sorry, I couldn't read that button. Ask me for a fresh card.",
  outdatedButton: 'That button is out of date. Ask me for a fresh card.',
  stillSaving: 'Got it. Still saving your first tap.',
  alreadyAnsweredPrefix: 'Already answered: you chose',
  youChosePrefix: 'You chose:',
  nextApprove: 'will pick this up now.',
  nextHold: 'will see your answer and hold off.',
  nextRejected: 'This is stopped. Nothing will go ahead.',
  replySavedPrefix: 'Saved your note on',
  replyWhoActs: 'will act on it next.',
  replyFailed: "❌ That didn't go through.",
  replySendAgain: 'Send your reply again.',
  replyNoCard: "I saved your note, but I couldn't tell which card it belongs to, so I passed it to the main agent.",
  explainIntro: "Here's what this card is about:",
  explainChooseBelow: 'Pick an answer below, or reply with more instructions.',
  explainAlreadyAnswered: 'You already answered this one.',
  defaultTeam: 'The team',
  nonCardAck:
    "I saw your message. To get an answer, reply to a card, post in an agent's topic, or message me directly.",
  chatFallbackAck: "Got your message. I don't have an answer yet, but it's saved and the team can see it.",
});

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

/** Approximate monospace display width: emoji count as 2, variation selectors /
 * joiners as 0 — enough to keep the box edges lined up for our own strings. */
function displayWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d || (cp >= 0x0300 && cp <= 0x036f)) continue;
    if (cp >= 0x1f000 || cp === 0x2705 || cp === 0x274c || cp === 0x2b50 || (cp >= 0x2600 && cp <= 0x27bf)) w += 2;
    else w += 1;
  }
  return w;
}

function truncate(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Draws a box around the given lines. Returns plain (unescaped) text. */
export function boxLines(lines) {
  const clean = lines.map((l) => truncate(l, 40));
  const inner = Math.max(...clean.map(displayWidth)) + 2;
  const top = `┌${'─'.repeat(inner)}┐`;
  const bottom = `└${'─'.repeat(inner)}┘`;
  const body = clean.map((l) => `│ ${l}${' '.repeat(inner - 1 - displayWidth(l))}│`);
  return [top, ...body, bottom].join('\n');
}

/** The box wrapped in <pre> so Telegram renders it monospace. */
export function boxHtml(lines) {
  return `<pre>${escapeHtml(boxLines(lines))}</pre>`;
}

/** "BUILD" -> "The build agent", "AXON Executive" -> "The AXON Executive agent". */
export function friendlyOwner(owner) {
  const o = String(owner ?? '').trim();
  if (!o) return JB_TEXT.defaultTeam;
  const name = /^[A-Z][A-Z ]*$/.test(o) ? o.toLowerCase() : o;
  return /agent$/i.test(name) ? `The ${name}` : `The ${name} agent`;
}

const NEGATIVE_CHOICE_RE = /\b(reject|cancel|no|deny|decline|stop|hold|send back|skip|don'?t)\b/i;

/** One plain line saying what happens next after a tap. */
export function nextStepLine({ decision, choiceText, owner }) {
  if (decision === 'reject') return JB_TEXT.nextRejected;
  const who = friendlyOwner(owner);
  if (choiceText && NEGATIVE_CHOICE_RE.test(choiceText)) return `${who} ${JB_TEXT.nextHold}`;
  return `${who} ${JB_TEXT.nextApprove}`;
}

/** The receipt shown on the card after a successful tap (HTML). */
export function tapReceiptHtml({ choiceText, decision, owner }) {
  return `${boxHtml([JB_TEXT.gotIt, `${JB_TEXT.youChosePrefix} ${choiceText}`])}\n${escapeHtml(
    nextStepLine({ decision, choiceText, owner }),
  )}`;
}

/** The retry notice shown on the card when a tap failed to record (HTML). */
export function tapFailedHtml() {
  return boxHtml([JB_TEXT.failedShort, JB_TEXT.tapAgain]);
}

export function alreadyAnsweredText(choiceText) {
  return `${JB_TEXT.alreadyAnsweredPrefix} ${choiceText}.`;
}

const CARD_TAP_HINT_RE = /\n*\s*👉[^\n]*$/u;
const OLD_RECEIPT_RE = /\n*┌[\s\S]*$/u;

/**
 * Rebuilds the card body (HTML) from what Telegram shows on the tapped
 * message: keeps the question, drops the "tap an option" hint and any old
 * receipt/retry box, so a re-edit never stacks boxes.
 */
export function cardBodyHtml(messageText, fallbackQuestion) {
  let text = String(messageText ?? '').trim();
  text = text.replace(OLD_RECEIPT_RE, '').replace(CARD_TAP_HINT_RE, '').trim();
  if (!text) text = String(fallbackQuestion ?? '').trim();
  if (!text) return '';
  const lines = text.split('\n');
  // The card's first line is its bold header ("🟡 Needs Your Approval").
  if (/needs your approval/i.test(lines[0])) {
    return [`<b>${escapeHtml(lines[0])}</b>`, ...lines.slice(1).map(escapeHtml)].join('\n');
  }
  return lines.map(escapeHtml).join('\n');
}

/** Rebuilds the inline keyboard for a dispatch row (same callback_data the card uses). */
export function approvalKeyboard(dispatchId, options) {
  const opts = Array.isArray(options) && options.length ? options : ['✅ Approve', '❌ Reject'];
  return {
    inline_keyboard: opts.map((text, idx) => [{ text: String(text), callback_data: `nvga:d:${dispatchId}:${idx}` }]),
  };
}

/**
 * Reads the answer already recorded on a dispatch row, or null when the row is
 * still waiting on JB. Used to make a double tap idempotent and to stop a
 * question-reply from re-showing buttons on an answered card.
 */
export function priorChoice(row) {
  if (!row) return null;
  if (row.status === 'rejected') return 'Reject';
  const reAsked =
    row.needs_jb_approval === true || ['needs_jb', 'needs_context', 'blocked'].includes(row.status);
  if (reAsked) return null;
  const summary = String(row.result_summary ?? '');
  const selected = /\[JB selected: "([^"]*)"/.exec(summary);
  if (selected) return selected[1];
  if (/\[JB approved /.test(summary)) return 'Approve';
  if (/\[JB rejected /.test(summary)) return 'Reject';
  return null;
}

const QUESTION_RE =
  /(\?\s*$|^\s*(explain|why|what|huh|context|more context|more info|details|tell me more|i don'?t (get|understand))\b|\b(explain|more context|more info|what is this|what does this mean)\b)/i;

/** True when a typed reply to a card is JB asking about it rather than instructing. */
export function isQuestionReply(text) {
  return QUESTION_RE.test(String(text ?? '').trim());
}

/** Strips internal codes/paths out of free text before JB sees it. */
export function plainEnglish(text) {
  return String(text ?? '')
    .replace(/\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/g, '')
    .replace(/\S+\.(ts|tsx|mjs|js|sql|py|json|md|sh)\b/gi, 'a file')
    .replace(/\b(?:pull request|pr)\s*#?\d+\b/gi, '')
    .replace(/\bcommit\s+[0-9a-f]{7,40}\b/gi, 'a change')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/gi, '')
    .replace(/[`*#_{}<>|\\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Plain-English explanation of a card, built from its dispatch row (no model call). */
export function explainFromRow(row) {
  const ask = plainEnglish(row?.jb_ask || row?.title || '');
  const who = friendlyOwner(row?.owner);
  const opts = Array.isArray(row?.jb_options) && row.jb_options.length ? row.jb_options : ['Approve', 'Reject'];
  const lines = [JB_TEXT.explainIntro];
  if (ask) lines.push(`The question: ${ask}`);
  lines.push(`${who} is waiting on your answer before going ahead.`);
  lines.push(`Your choices: ${opts.map((o) => plainEnglish(o)).join(' or ')}.`);
  return lines.join('\n');
}
