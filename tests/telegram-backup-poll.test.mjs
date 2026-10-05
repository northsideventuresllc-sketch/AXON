// Backup Telegram tap receiver. Every Telegram call, probe, handler and the
// Supabase client is a fake; nothing touches the network or a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackupPoll } from '../scripts/telegram-backup-poll.mjs';

function setup({ probes = [true], webhookUrl = 'https://host.example/api/telegram-webhook', state = {}, updates = [], secret = 'sec', handlerFail = new Set(), apply = true } = {}) {
  const calls = [];
  const store = { state: { ...state } };
  let pi = 0;
  const deps = {
    env: { AXON_WEBHOOK_URL: '' },
    loadTelegram: async () => ({ sb: { sbSelect: async () => [] }, telegram: { telegramToken: 'tok', telegramWebhookSecret: secret } }),
    loadFullCfg: async () => ({ telegramToken: 'tok' }),
    getWebhookInfo: async () => ({ url: webhookUrl }),
    deleteWebhook: async () => { calls.push(['deleteWebhook']); },
    setWebhook: async (t, url, s) => { calls.push(['setWebhook', url, s]); },
    getUpdates: async (t, off) => { calls.push(['getUpdates', off]); return updates; },
    probe: async () => probes[Math.min(pi++, probes.length - 1)],
    sleep: async () => {},
    handlers: {
      handleTelegramCallback: async (c, s, q) => { calls.push(['callback', q.id]); if (handlerFail.has(q.id)) throw new Error('boom'); },
      handleTelegramMessage: async (c, s, m) => { calls.push(['message', m.text]); },
    },
    readState: () => ({ ...store.state }),
    writeState: (p, s) => { store.state = JSON.parse(JSON.stringify(s)); calls.push(['writeState', s.mode, s.offset]); },
    statePath: '/nonexistent/state.json',
    now: () => '2026-10-05T00:00:00Z',
  };
  const argv = apply ? ['--apply'] : [];
  return { deps, calls, store, run: () => runBackupPoll(argv, deps) };
}
const names = (calls) => calls.map((c) => c[0]);

test('healthy host does nothing', async () => {
  const t = setup({ probes: [true] });
  const r = await t.run();
  assert.equal(r.code, 0);
  assert.equal(r.line, 'host healthy, nothing to do');
  assert.deepEqual(t.calls, []);
});

test('a single down probe followed by up does nothing', async () => {
  const t = setup({ probes: [false, true] });
  const r = await t.run();
  assert.equal(r.code, 0);
  assert.deepEqual(t.calls, []);
});

test('two down probes with webhook set: deleteWebhook then polling', async () => {
  const t = setup({ probes: [false, false], updates: [{ update_id: 5, callback_query: { id: 'c1' } }] });
  const r = await t.run();
  assert.equal(r.code, 0);
  assert.match(r.line, /handled 1 tap/);
  const n = names(t.calls);
  assert.ok(n.indexOf('deleteWebhook') < n.indexOf('getUpdates'));
  assert.equal(t.store.state.mode, 'backup');
});

test('callback_query and message are routed to their handlers', async () => {
  const t = setup({ probes: [false, false], updates: [
    { update_id: 1, callback_query: { id: 'c1' } },
    { update_id: 2, message: { text: 'hi', chat: { id: 1 } } },
  ] });
  await t.run();
  assert.ok(t.calls.some((c) => c[0] === 'callback' && c[1] === 'c1'));
  assert.ok(t.calls.some((c) => c[0] === 'message' && c[1] === 'hi'));
});

test('offset is persisted only after a handled update', async () => {
  const t = setup({ probes: [false, false], webhookUrl: '', state: { mode: 'backup' }, updates: [{ update_id: 10, callback_query: { id: 'c1' } }] });
  await t.run();
  assert.equal(t.store.state.offset, 11);
  const t2 = setup({ probes: [false, false], webhookUrl: '', state: { mode: 'backup', offset: 10 }, updates: [{ update_id: 10, callback_query: { id: 'bad' } }], handlerFail: new Set(['bad']) });
  const r = await t2.run();
  assert.equal(r.code, 1);
  assert.equal(t2.store.state.offset, 10, 'failed update keeps its offset position');
});

test('a failed update does not stop the next one', async () => {
  const t = setup({ probes: [false, false], webhookUrl: '', state: { mode: 'backup' }, handlerFail: new Set(['bad']), updates: [
    { update_id: 1, callback_query: { id: 'bad' } },
    { update_id: 2, callback_query: { id: 'ok' } },
  ] });
  const r = await t.run();
  assert.equal(r.code, 1);
  assert.ok(t.calls.some((c) => c[0] === 'callback' && c[1] === 'ok'));
  assert.equal(t.store.state.offset, 1);
});

test('a twice-failed update is dropped so it cannot block forever', async () => {
  const t = setup({ probes: [false, false], webhookUrl: '', state: { mode: 'backup', offset: 1, retries: { 1: 1 } }, handlerFail: new Set(['bad']), updates: [{ update_id: 1, callback_query: { id: 'bad' } }] });
  await t.run();
  assert.equal(t.store.state.offset, 2);
});

test('duplicate update ids are skipped', async () => {
  const t = setup({ probes: [false, false], webhookUrl: '', state: { mode: 'backup', seen: [7] }, updates: [{ update_id: 7, callback_query: { id: 'dup' } }] });
  await t.run();
  assert.ok(!t.calls.some((c) => c[0] === 'callback'));
});

test('host back while mode=backup: setWebhook with secret_token', async () => {
  const t = setup({ probes: [true], webhookUrl: '', state: { mode: 'backup', url: 'https://host.example/hook' } });
  const r = await t.run();
  assert.equal(r.code, 0);
  assert.deepEqual(t.calls.find((c) => c[0] === 'setWebhook'), ['setWebhook', 'https://host.example/hook', 'sec']);
  assert.equal(t.store.state.mode, 'webhook');
  assert.ok(!names(t.calls).includes('getUpdates'));
});

test('host back refuses (exit 1) when the secret is missing', async () => {
  const t = setup({ probes: [true], webhookUrl: '', state: { mode: 'backup', url: 'https://h/x' }, secret: '' });
  const r = await t.run();
  assert.equal(r.code, 1);
  assert.ok(!names(t.calls).includes('setWebhook'));
});

test('dry-run calls nothing mutating and no handler', async () => {
  for (const sc of [
    { probes: [false, false] },
    { probes: [false, false], webhookUrl: '', state: { mode: 'backup' } },
    { probes: [true], webhookUrl: '', state: { mode: 'backup', url: 'https://h/x' } },
  ]) {
    const t = setup({ ...sc, apply: false, updates: [{ update_id: 1, callback_query: { id: 'c' } }] });
    const r = await t.run();
    assert.equal(r.code, 0);
    assert.match(r.line, /dry-run/);
    assert.deepEqual(t.calls, []);
  }
});

test('--help prints usage', async () => {
  const r = await runBackupPoll(['--help']);
  assert.match(r.line, /Usage/);
});
