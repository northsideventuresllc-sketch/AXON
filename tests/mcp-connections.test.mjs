#!/usr/bin/env node
/**
 * lib/axon-v0/mcp-connections.mjs — per-account MCP server connection storage (problem #9).
 * "Paste it, it's encrypted, it works immediately" — same convention as
 * lib/axon-account-keys.mjs (tests/mcp-connections.test.mjs's own encryption assertions
 * reuse that module's encrypt/decrypt directly, since mcp-connections.mjs does too, rather
 * than re-testing crypto internals already covered elsewhere).
 *
 * No real network: global.fetch is mocked per-table, same pattern as
 * tests/agent-bus-fire-and-run.test.mjs and tests/mcp-supabase.test.mjs.
 *
 * Run: node tests/mcp-connections.test.mjs
 */
import assert from 'node:assert/strict';
import {
  validateMcpConnectionSpec,
  toPublicRow,
  listMcpConnections,
  createMcpConnection,
  deleteMcpConnection,
  getMcpConnectionByName,
  getMcpConnectionRow,
  decryptMcpCredential,
  recordMcpCheckResult,
} from '../lib/axon-v0/mcp-connections.mjs';
import { decryptProviderKey } from '../lib/axon-account-keys.mjs';

process.env.AXON_KEYSTORE_SECRET = 'test-keystore-secret-not-real';

const FAKE_KEY = 'fake-supabase-service-key';
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

// ---------------------------------------------------------------------------
// Pure validation — no I/O
// ---------------------------------------------------------------------------

// --- 1. empty name is refused -------------------------------------------------------------
{
  const r = validateMcpConnectionSpec({ name: '  ', transport: 'http', serverUrl: 'https://x.com' });
  assert.equal(r.valid, false);
  assert.match(r.reason, /name/i);
}

// --- 2. http transport with no server URL is refused --------------------------------------
{
  const r = validateMcpConnectionSpec({ name: 'x', transport: 'http', serverUrl: '' });
  assert.equal(r.valid, false);
  assert.match(r.reason, /server url/i);
}

// --- 3. a malformed URL is refused ---------------------------------------------------------
{
  const r = validateMcpConnectionSpec({ name: 'x', transport: 'http', serverUrl: 'not a url' });
  assert.equal(r.valid, false);
}

// --- 4. stdio with no command is refused ---------------------------------------------------
{
  const r = validateMcpConnectionSpec({ name: 'x', transport: 'stdio', command: '' });
  assert.equal(r.valid, false);
  assert.match(r.reason, /command/i);
}

// --- 5. an unknown auth type is refused -----------------------------------------------------
{
  const r = validateMcpConnectionSpec({ name: 'x', transport: 'http', serverUrl: 'https://x.com', authType: 'oauth2' });
  assert.equal(r.valid, false);
}

// --- 6. a non-none auth type with no credential is refused ----------------------------------
{
  const r = validateMcpConnectionSpec({
    name: 'x',
    transport: 'http',
    serverUrl: 'https://x.com',
    authType: 'bearer',
    credential: '   ',
  });
  assert.equal(r.valid, false);
  assert.match(r.reason, /credential/i);
}

// --- 7. a well-formed http + bearer spec is valid --------------------------------------------
{
  const r = validateMcpConnectionSpec({
    name: 'My MCP',
    transport: 'http',
    serverUrl: 'https://mcp.example.com/rpc',
    authType: 'bearer',
    credential: 'tok-123',
  });
  assert.equal(r.valid, true);
}

// --- 8. a well-formed stdio + no-auth spec is valid (transport stored, never executed) -----
{
  const r = validateMcpConnectionSpec({ name: 'Local tool', transport: 'stdio', command: 'npx -y @x/mcp' });
  assert.equal(r.valid, true);
}

// --- 9. toPublicRow never carries credential_ciphertext, only last4 -------------------------
{
  const pub = toPublicRow({
    id: 'row-1',
    name: 'x',
    transport: 'http',
    server_url: 'https://x.com',
    command: null,
    auth_type: 'bearer',
    header_name: null,
    credential_ciphertext: 'super-secret-ciphertext-blob',
    credential_last4: 'wxyz',
    status: 'connected',
    last_checked_at: null,
    last_error: null,
    server_info: { name: 'X' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(pub.hasCredential, true);
  assert.equal(pub.credentialLast4, 'wxyz');
  assert.equal('credential_ciphertext' in pub, false);
  assert.equal(JSON.stringify(pub).includes('super-secret-ciphertext-blob'), false);
}

// --- 10. toPublicRow(null) is null, never throws ---------------------------------------------
{
  assert.equal(toPublicRow(null), null);
}

// ---------------------------------------------------------------------------
// CRUD against a mocked Supabase REST surface
// ---------------------------------------------------------------------------

function makeFetchMock() {
  const rows = new Map(); // id -> row
  let nextId = 1;

  const handler = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    if (!u.includes('axon_account_mcp_servers')) {
      throw new Error(`unexpected table in mock: ${u}`);
    }

    if (method === 'POST') {
      const body = JSON.parse(opts.body);
      const id = `row-${nextId++}`;
      const row = {
        id,
        account_id: body.account_id,
        name: body.name,
        transport: body.transport,
        server_url: body.server_url ?? null,
        command: body.command ?? null,
        auth_type: body.auth_type,
        header_name: body.header_name ?? null,
        credential_ciphertext: body.credential_ciphertext ?? null,
        credential_last4: body.credential_last4 ?? null,
        status: body.status || 'pending',
        last_checked_at: null,
        last_error: null,
        server_info: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Unique (account_id, name) — mirrors the real table's constraint so the
      // duplicate-name test below exercises the same error path createMcpConnection maps.
      for (const existing of rows.values()) {
        if (existing.account_id === row.account_id && existing.name === row.name) {
          return { ok: false, status: 409, text: async () => 'duplicate key value violates unique constraint "axon_account_mcp_servers_account_id_name_key"' };
        }
      }
      rows.set(id, row);
      return { ok: true, json: async () => [row] };
    }

    if (method === 'GET') {
      const qs = u.split('?')[1] || '';
      const params = new URLSearchParams(qs);
      let list = Array.from(rows.values());
      const accountEq = params.get('account_id');
      if (accountEq?.startsWith('eq.')) list = list.filter((r) => r.account_id === accountEq.slice(3));
      const idEq = params.get('id');
      if (idEq?.startsWith('eq.')) list = list.filter((r) => r.id === idEq.slice(3));
      const nameEq = params.get('name');
      if (nameEq?.startsWith('eq.')) list = list.filter((r) => r.name === decodeURIComponent(nameEq.slice(3)));
      return { ok: true, json: async () => list };
    }

    if (method === 'PATCH') {
      const qs = u.split('?')[1] || '';
      const params = new URLSearchParams(qs);
      const idEq = params.get('id');
      const id = idEq?.startsWith('eq.') ? idEq.slice(3) : null;
      const row = id ? rows.get(id) : null;
      if (!row) return { ok: true, json: async () => [] };
      const patch = JSON.parse(opts.body);
      Object.assign(row, patch);
      return { ok: true, json: async () => [row] };
    }

    if (method === 'DELETE') {
      const qs = u.split('?')[1] || '';
      const params = new URLSearchParams(qs);
      const idEq = params.get('id');
      const id = idEq?.startsWith('eq.') ? idEq.slice(3) : null;
      const accountEq = params.get('account_id');
      const accountId = accountEq?.startsWith('eq.') ? accountEq.slice(3) : null;
      const candidate = id ? rows.get(id) : null;
      // The real Supabase filter ANDs account_id=eq.X&id=eq.Y — a delete for the wrong
      // account must not touch a row that belongs to someone else.
      const row = candidate && (!accountId || candidate.account_id === accountId) ? candidate : null;
      if (row) rows.delete(id);
      return { ok: true, json: async () => (row ? [row] : []) };
    }

    throw new Error(`unhandled method in mock: ${method}`);
  };

  return { handler, rows };
}

// --- 11. createMcpConnection encrypts the credential; the row never carries plaintext ------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  const created = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, {
    name: 'Notion',
    transport: 'http',
    serverUrl: 'https://mcp.notion.com/rpc',
    authType: 'bearer',
    credential: 'sk-notion-live-abc',
  });

  assert.equal(created.ok, true);
  assert.ok(created.row.credential_ciphertext, 'credential must be stored encrypted');
  assert.equal(created.row.credential_ciphertext.includes('sk-notion-live-abc'), false);
  assert.equal(created.row.credential_last4, '-abc');
}

// --- 12. round trip: what got stored decrypts back to the original plaintext --------------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  const created = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, {
    name: 'Round Trip',
    transport: 'http',
    serverUrl: 'https://mcp.example.com/rpc',
    authType: 'bearer',
    credential: 'sk-roundtrip-999',
  });
  assert.equal(created.ok, true);
  const decrypted = decryptProviderKey(created.row.credential_ciphertext);
  assert.equal(decrypted, 'sk-roundtrip-999');
  assert.equal(created.row.credential_last4, '-999');

  // decryptMcpCredential (this module's own wrapper) gives the same answer.
  assert.equal(decryptMcpCredential(created.row), 'sk-roundtrip-999');
  assert.equal(decryptMcpCredential({ credential_ciphertext: null }), null);
}

// --- 13. createMcpConnection with no credential (auth_type 'none') stores no ciphertext ---
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  const created = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, {
    name: 'Open Server',
    transport: 'http',
    serverUrl: 'https://open.example.com/rpc',
    authType: 'none',
  });
  assert.equal(created.ok, true);
  assert.equal(created.row.credential_ciphertext, null);
}

// --- 14. duplicate name for the same account is refused with a plain-English reason -------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  const spec = { name: 'Dup', transport: 'http', serverUrl: 'https://a.example.com', authType: 'none' };
  const first = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, spec);
  assert.equal(first.ok, true);
  const second = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, spec);
  assert.equal(second.ok, false);
  assert.match(second.reason, /already exists/i);
}

// --- 15. listMcpConnections returns only this account's connections, as public rows -------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  await createMcpConnection(FAKE_KEY, ACCOUNT_ID, { name: 'A', transport: 'http', serverUrl: 'https://a.example.com', authType: 'none' });
  await createMcpConnection(FAKE_KEY, 'other-account', { name: 'B', transport: 'http', serverUrl: 'https://b.example.com', authType: 'none' });

  const list = await listMcpConnections(FAKE_KEY, ACCOUNT_ID);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'A');
  assert.equal('credential_ciphertext' in list[0], false);
}

// --- 16. getMcpConnectionByName resolves the exact row mcp_ping needs ---------------------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  await createMcpConnection(FAKE_KEY, ACCOUNT_ID, {
    name: 'My Notion MCP',
    transport: 'http',
    serverUrl: 'https://mcp.notion.com/rpc',
    authType: 'none',
  });

  const row = await getMcpConnectionByName(FAKE_KEY, ACCOUNT_ID, 'My Notion MCP');
  assert.ok(row);
  assert.equal(row.server_url, 'https://mcp.notion.com/rpc');

  const missing = await getMcpConnectionByName(FAKE_KEY, ACCOUNT_ID, 'Nonexistent');
  assert.equal(missing, null);
}

// --- 17. deleteMcpConnection removes the row and is scoped to the account -----------------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  const created = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, { name: 'To Delete', transport: 'http', serverUrl: 'https://d.example.com', authType: 'none' });
  const removedWrongAccount = await deleteMcpConnection(FAKE_KEY, 'someone-else', created.row.id);
  assert.equal(removedWrongAccount, false);

  const removed = await deleteMcpConnection(FAKE_KEY, ACCOUNT_ID, created.row.id);
  assert.equal(removed, true);

  const list = await listMcpConnections(FAKE_KEY, ACCOUNT_ID);
  assert.equal(list.find((r) => r.id === created.row.id), undefined);
}

// --- 18. recordMcpCheckResult(ok) marks connected and clears any prior error --------------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  const created = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, { name: 'Check Me', transport: 'http', serverUrl: 'https://c.example.com', authType: 'none' });
  const updated = await recordMcpCheckResult(FAKE_KEY, ACCOUNT_ID, created.row.id, {
    ok: true,
    serverInfo: { name: 'Checked Server' },
  });
  assert.equal(updated.status, 'connected');
  assert.equal(updated.last_error, null);
  assert.equal(updated.server_info.name, 'Checked Server');
}

// --- 19. recordMcpCheckResult(!ok) marks error with a stored, truncated reason ------------
{
  const { handler } = makeFetchMock();
  global.fetch = handler;

  const created = await createMcpConnection(FAKE_KEY, ACCOUNT_ID, { name: 'Fails', transport: 'http', serverUrl: 'https://f.example.com', authType: 'none' });
  const updated = await recordMcpCheckResult(FAKE_KEY, ACCOUNT_ID, created.row.id, {
    ok: false,
    error: 'connection refused',
  });
  assert.equal(updated.status, 'error');
  assert.match(updated.last_error, /connection refused/);

  const fetched = await getMcpConnectionRow(FAKE_KEY, ACCOUNT_ID, created.row.id);
  assert.equal(fetched.status, 'error');
}

// --- 20. every function fails soft (empty/null), never throws, when the store is unreachable
{
  global.fetch = async () => {
    throw new Error('network down');
  };
  assert.deepEqual(await listMcpConnections(FAKE_KEY, ACCOUNT_ID), []);
  assert.equal(await getMcpConnectionByName(FAKE_KEY, ACCOUNT_ID, 'x'), null);
  assert.equal(await deleteMcpConnection(FAKE_KEY, ACCOUNT_ID, 'row-x'), false);
  assert.equal(await recordMcpCheckResult(FAKE_KEY, ACCOUNT_ID, 'row-x', { ok: true }), null);
}

console.log('mcp-connections.test.mjs OK');
