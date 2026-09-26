// Lints every fixed JB-facing string for jargon and proves the card body
// (question text) is never truncated, per Decision #2013 / Learning #9903
// (JB 2026-09-24: cards were cut off at an old 160-char fallback and carried
// code jargon). Referenced by the header comment in lib/telegram-jb-receipts.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JB_TEXT, cardBodyHtml, explainFromRow, plainEnglish } from '../lib/telegram-jb-receipts.mjs';

// Same shapes plainEnglish() strips: dispatch job codes, file names, markdown.
const JOB_CODE_RE = /\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+){2,}\b/;
const FILE_NAME_RE = /\S+\.(ts|tsx|mjs|js|sql|py|json|md|sh)\b/i;
const MARKDOWN_RE = /[`*#_{}<>|\\]/;
const SHA_RE = /\b[0-9a-f]{7,40}\b/i;

function assertNoJargon(label, text) {
  assert.ok(!JOB_CODE_RE.test(text), `${label} contains a job code: ${text}`);
  assert.ok(!FILE_NAME_RE.test(text), `${label} contains a file name: ${text}`);
  assert.ok(!MARKDOWN_RE.test(text), `${label} contains markdown/code punctuation: ${text}`);
  assert.ok(!SHA_RE.test(text), `${label} contains a commit SHA: ${text}`);
}

test('every JB_TEXT string is plain English, no jargon', () => {
  for (const [key, value] of Object.entries(JB_TEXT)) {
    assertNoJargon(`JB_TEXT.${key}`, value);
  }
});

test('cardBodyHtml never truncates the question, however long', () => {
  const longQuestion =
    'Should the team ship the new pricing page today, or hold it until the ' +
    'billing numbers are double-checked against last month, given that the ' +
    'landing page traffic has been climbing and a wrong price could cost real money?';
  assert.ok(longQuestion.length > 160, 'fixture question must exceed the old 160-char cutoff');

  const body = cardBodyHtml(null, longQuestion);
  assert.ok(body.includes(longQuestion), 'full question text must be preserved, not cut off');
  assert.ok(!body.includes('…'), 'no ellipsis truncation marker should appear');
});

test('cardBodyHtml preserves a long already-sent message body untouched', () => {
  const longMessage = `🟡 Needs Your Approval\n\n${'A'.repeat(200)}\n\n👉 Tap an option below or reply to this message.`;
  const body = cardBodyHtml(longMessage, 'fallback');
  assert.ok(body.includes('A'.repeat(200)), 'long message body must not be cut off');
  assert.ok(!body.includes('…'));
});

test('explainFromRow keeps the full question and stays jargon-free', () => {
  const longAsk =
    'Do you want AXON to fold the outreach retry logic into the nightly build now, ' +
    'or wait until the lead-scoring pass finishes running so the two do not collide?';
  const row = { jb_ask: longAsk, owner: 'BUILD', jb_options: ['Approve', 'Reject'] };
  const text = explainFromRow(row);
  assert.ok(text.includes(longAsk), 'long jb_ask must not be truncated');
  assertNoJargon('explainFromRow output', text);
});

test('plainEnglish strips job codes, file names, markdown, PR numbers, and SHAs', () => {
  const raw =
    'Fixed AX-MINI-JOBS-NO-TIER-GATE-0813 in `lib/nvg-mini-queue.mjs` per PR #609, ' +
    'commit 8e086b120ee53dcfcbd6985385d79cf89638ee41.';
  const cleaned = plainEnglish(raw);
  assertNoJargon('plainEnglish output', cleaned);
  assert.ok(!/\bPR\b/i.test(cleaned), `PR reference should be stripped: ${cleaned}`);
  assert.ok(!cleaned.includes('609'), `PR number should be stripped: ${cleaned}`);
});
