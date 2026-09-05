// BUILD-RECREATE-AXON-RESEND-SENDER-0904: proves resendSend falls back to
// cfg.resendReplyTo when no per-call replyTo is given, and that an explicit
// per-call replyTo still wins.
import assert from 'node:assert/strict';
import { resendSend } from '../lib/resend.mjs';

const cfg = {
  resendKey: 'test-key',
  resendFrom: 'JB <jb@northsideintelligence.com>',
  resendReplyTo: 'jb@northsideintelligence.com',
  dryRun: false,
};

let lastBody;
globalThis.fetch = async (_url, opts) => {
  lastBody = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ id: 'test' }) };
};

await resendSend(cfg, { to: 'lead@example.com', subject: 'Hi', html: 'body' });
assert.equal(lastBody.reply_to, cfg.resendReplyTo, 'should fall back to cfg.resendReplyTo');
assert.equal(lastBody.from, cfg.resendFrom);

await resendSend(cfg, { to: 'lead@example.com', subject: 'Hi', html: 'body', replyTo: 'other@example.com' });
assert.equal(lastBody.reply_to, 'other@example.com', 'explicit replyTo should win over cfg default');

console.log('resend-reply-to.test.mjs passed');
