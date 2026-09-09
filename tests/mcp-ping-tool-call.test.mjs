#!/usr/bin/env node
/**
 * lib/axon-agent-bus.mjs's mcp_ping tool call (problem #9) — proves an AXON agent can reach
 * a connected MCP server mid-answer, the same way fire_agent/ask_operator are ordinary tool
 * calls (tests/agent-bus-loop-guards.test.mjs covers parseToolCall/validateToolCall for all
 * three; this file covers mcp_ping's actual EXECUTION through handleToolCall(), end to end:
 * account's connection lookup -> decrypt -> real handshake -> status written back).
 *
 * No real network: global.fetch is mocked for both legs — the Supabase REST calls
 * (lib/axon-v0/mcp-connections.mjs) AND the outbound MCP handshake itself
 * (lib/axon-v0/mcp-client.mjs) share the ambient global.fetch here, same as a real deploy
 * would, just pointed at fake hosts. Same mocking pattern as tests/agent-bus-fire-and-run.test.mjs.
 *
 * Run: node tests/mcp-ping-tool-call.test.mjs
 */
import assert from 'node:assert/strict';
import { handleToolCall, KNOWN_TOOLS } from '../lib/axon-agent-bus.mjs';
import { encryptProviderKey } from '../lib/axon-account-keys.mjs';

process.env.SUPABASE_SERVICE_KEY = 'fake-supabase-key';
process.env.AXON_KEYSTORE_SECRET = 'test-keystore-secret-not-real';

const ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';

function jsonRes(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) };
}

// --- 1. mcp_ping is a known tool -----------------------------------------------------------
{
  assert.ok(KNOWN_TOOLS.includes('mcp_ping'));
}

// --- 2. no accountId in runCtx -> refuses cleanly, never attempts a lookup or a fetch ------
{
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonRes({});
  };
  const result = await handleToolCall('```tool\n{"tool": "mcp_ping", "server": "Anything"}\n```', {
    agentId: 'agent-a',
  });
  assert.equal(result.tool, 'mcp_ping');
  assert.equal(result.valid, true);
  assert.equal(result.result.ok, false);
  assert.match(result.result.error, /no account context/i);
  assert.equal(calls, 0, 'must not touch the network with no account to scope the lookup to');
}

// --- 3. no connection with that name -> ok:false, plain-English, no handshake attempted ----
{
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return jsonRes([]); // empty select result — no matching row
  };
  const result = await handleToolCall('```tool\n{"tool": "mcp_ping", "server": "Ghost Server"}\n```', {
    agentId: 'agent-a',
    accountId: ACCOUNT_ID,
  });
  assert.equal(result.result.ok, false);
  assert.match(result.result.error, /no mcp server named "ghost server"/i);
  assert.ok(calls.every((u) => u.includes('axon_account_mcp_servers')), 'must only have queried the connections table, never attempted an outbound handshake');
}

// --- 4. a connected server: real lookup -> decrypt -> handshake -> status written back -----
{
  const credentialCiphertext = encryptProviderKey('tok-live-mcp-999');
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    calls.push(`${method} ${u}`);

    if (u.includes('axon_account_mcp_servers') && method === 'GET') {
      return jsonRes([
        {
          id: 'row-live-1',
          account_id: ACCOUNT_ID,
          name: 'Live Server',
          transport: 'http',
          server_url: 'https://mcp.example.com/rpc',
          auth_type: 'bearer',
          header_name: null,
          credential_ciphertext: credentialCiphertext,
          status: 'pending',
        },
      ]);
    }
    if (u.includes('axon_account_mcp_servers') && method === 'PATCH') {
      const body = JSON.parse(opts.body);
      return jsonRes([{ id: 'row-live-1', ...body }]);
    }
    if (u === 'https://mcp.example.com/rpc') {
      assert.equal(opts.headers.Authorization, 'Bearer tok-live-mcp-999', 'the decrypted credential must reach the real handshake request');
      return jsonRes({
        jsonrpc: '2.0',
        id: 'axon-initialize-1',
        result: { serverInfo: { name: 'Live MCP', version: '9.9.9' } },
      });
    }
    throw new Error(`unexpected fetch in test: ${method} ${u}`);
  };

  const result = await handleToolCall('Checking now.\n```tool\n{"tool": "mcp_ping", "server": "Live Server"}\n```', {
    agentId: 'agent-a',
    accountId: ACCOUNT_ID,
  });

  assert.equal(result.tool, 'mcp_ping');
  assert.equal(result.valid, true);
  assert.equal(result.server, 'Live Server');
  assert.equal(result.result.ok, true);
  assert.equal(result.result.serverInfo.name, 'Live MCP');

  // The credential must never appear in the tool-call result handed back into the
  // conversation — only serverInfo/protocolVersion/capabilities, never the secret.
  assert.doesNotMatch(JSON.stringify(result), /tok-live-mcp-999/);

  const patchCall = calls.find((c) => c.startsWith('PATCH'));
  assert.ok(patchCall, 'a successful handshake must write the row status back (same as the Settings "Verify" button)');
}

// --- 5. an unreachable server: handshake fails, status written back as error, no throw ----
{
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    calls.push(`${method} ${u}`);
    if (u.includes('axon_account_mcp_servers') && method === 'GET') {
      return jsonRes([
        {
          id: 'row-down-1',
          account_id: ACCOUNT_ID,
          name: 'Down Server',
          transport: 'http',
          server_url: 'https://down.example.com/rpc',
          auth_type: 'none',
          credential_ciphertext: null,
          status: 'connected',
        },
      ]);
    }
    if (u.includes('axon_account_mcp_servers') && method === 'PATCH') {
      return jsonRes([{ id: 'row-down-1' }]);
    }
    if (u === 'https://down.example.com/rpc') throw new Error('ECONNREFUSED');
    throw new Error(`unexpected fetch in test: ${method} ${u}`);
  };

  const result = await handleToolCall('```tool\n{"tool": "mcp_ping", "server": "Down Server"}\n```', {
    agentId: 'agent-a',
    accountId: ACCOUNT_ID,
  });
  assert.equal(result.result.ok, false);
  assert.match(result.result.error, /ECONNREFUSED/);
  assert.ok(calls.some((c) => c.startsWith('PATCH')), 'a failed handshake must still write the error status back');
}

console.log('mcp-ping-tool-call.test.mjs OK');
