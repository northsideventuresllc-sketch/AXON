#!/usr/bin/env node
/**
 * lib/axon-v0/mcp-client.mjs — the real MCP `initialize` handshake used to prove a pasted-in
 * server is actually live (problem #9). No real network: every fetch is a mock, injected via
 * pingMcpServer()'s fetchImpl param — same pattern tests/agent-bus-fire-and-run.test.mjs and
 * tests/runpod-tier.test.mjs already use for this codebase's other fetch-driven modules.
 *
 * Run: node tests/mcp-client.test.mjs
 */
import assert from 'node:assert/strict';
import { pingMcpServer, buildAuthHeaders, checkMcpConnection, MCP_PROTOCOL_VERSION } from '../lib/axon-v0/mcp-client.mjs';

function jsonRes(status, body, headers = { 'content-type': 'application/json' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  };
}

function rawRes(status, text, headers = { 'content-type': 'text/plain' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => text,
  };
}

// --- 1. buildAuthHeaders: none/missing credential -> no headers -------------------------
{
  assert.deepEqual(buildAuthHeaders({ authType: 'none', credential: 'x' }), {});
  assert.deepEqual(buildAuthHeaders({ authType: 'bearer', credential: '' }), {});
  assert.deepEqual(buildAuthHeaders({ authType: 'bearer', credential: null }), {});
}

// --- 2. buildAuthHeaders: bearer ----------------------------------------------------------
{
  const h = buildAuthHeaders({ authType: 'bearer', credential: 'sk-abc123' });
  assert.deepEqual(h, { Authorization: 'Bearer sk-abc123' });
}

// --- 3. buildAuthHeaders: api_key defaults to X-Api-Key, honors headerName --------------
{
  assert.deepEqual(buildAuthHeaders({ authType: 'api_key', credential: 'k1' }), { 'X-Api-Key': 'k1' });
  assert.deepEqual(
    buildAuthHeaders({ authType: 'api_key', credential: 'k1', headerName: 'X-Custom-Key' }),
    { 'X-Custom-Key': 'k1' },
  );
}

// --- 4. buildAuthHeaders: basic base64-encodes the whole credential ----------------------
{
  const h = buildAuthHeaders({ authType: 'basic', credential: 'alice:hunter2' });
  const expected = `Basic ${Buffer.from('alice:hunter2', 'utf8').toString('base64')}`;
  assert.deepEqual(h, { Authorization: expected });
}

// --- 5. buildAuthHeaders never lets the raw credential leak into the returned object -----
// (defense-in-depth: the header VALUE necessarily carries it — this checks no OTHER key does)
{
  const h = buildAuthHeaders({ authType: 'bearer', credential: 'sk-super-secret' });
  assert.deepEqual(Object.keys(h), ['Authorization']);
}

// --- 6. pingMcpServer: no server URL -> ok:false, no fetch attempted --------------------
{
  let called = false;
  const result = await pingMcpServer({ serverUrl: '', fetchImpl: async () => { called = true; } });
  assert.equal(result.ok, false);
  assert.match(result.error, /no server url/i);
  assert.equal(called, false, 'must not call fetch with no URL to hit');
}

// --- 7. pingMcpServer: rejects non-http(s) URLs without ever calling fetch --------------
{
  let called = false;
  const result = await pingMcpServer({ serverUrl: 'ftp://evil.example/mcp', fetchImpl: async () => { called = true; } });
  assert.equal(result.ok, false);
  assert.match(result.error, /http:\/\/ or https:\/\//);
  assert.equal(called, false);
}

// --- 8. pingMcpServer: a real, well-formed JSON-RPC success is parsed correctly ---------
{
  let sentBody = null;
  let sentHeaders = null;
  const result = await pingMcpServer({
    serverUrl: 'https://mcp.example.com/rpc',
    authType: 'bearer',
    credential: 'tok-live-999',
    fetchImpl: async (url, opts) => {
      assert.equal(url, 'https://mcp.example.com/rpc');
      assert.equal(opts.method, 'POST');
      sentHeaders = opts.headers;
      sentBody = JSON.parse(opts.body);
      return jsonRes(200, {
        jsonrpc: '2.0',
        id: sentBody.id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: { name: 'Example MCP', version: '1.2.3' },
          capabilities: { tools: {}, resources: {} },
        },
      });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.serverInfo.name, 'Example MCP');
  assert.equal(result.protocolVersion, MCP_PROTOCOL_VERSION);
  assert.deepEqual(result.capabilities.sort(), ['resources', 'tools']);
  assert.equal(sentBody.method, 'initialize');
  assert.equal(sentBody.jsonrpc, '2.0');
  assert.equal(sentHeaders.Authorization, 'Bearer tok-live-999');
  assert.equal(sentHeaders.Accept, 'application/json, text/event-stream');
  // The credential must never appear anywhere in the returned result object.
  assert.doesNotMatch(JSON.stringify(result), /tok-live-999/);
}

// --- 9. pingMcpServer: an SSE-framed response is parsed the same way -------------------
{
  const sseBody = 'event: message\ndata: {"jsonrpc":"2.0","id":"axon-initialize-1","result":{"serverInfo":{"name":"SSE Server"}}}\n\n';
  const result = await pingMcpServer({
    serverUrl: 'https://mcp.example.com/sse-rpc',
    fetchImpl: async () => rawRes(200, sseBody, { 'content-type': 'text/event-stream' }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.serverInfo.name, 'SSE Server');
}

// --- 10. pingMcpServer: a JSON-RPC error response is a real failure, not a crash --------
{
  const result = await pingMcpServer({
    serverUrl: 'https://mcp.example.com/rpc',
    fetchImpl: async () =>
      jsonRes(200, { jsonrpc: '2.0', id: 'axon-initialize-1', error: { code: -32001, message: 'auth required' } }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /auth required/);
}

// --- 11. pingMcpServer: non-2xx HTTP is a real, truncated failure ------------------------
{
  const result = await pingMcpServer({
    serverUrl: 'https://mcp.example.com/rpc',
    fetchImpl: async () => rawRes(401, 'Unauthorized: bad token'.repeat(30)),
  });
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 401);
  assert.ok(result.error.length < 300, 'error message must be truncated, not an unbounded echo of the response body');
}

// --- 12. pingMcpServer: garbage (non-JSON, non-SSE) body fails cleanly ------------------
{
  const result = await pingMcpServer({
    serverUrl: 'https://mcp.example.com/rpc',
    fetchImpl: async () => rawRes(200, '<html>not an MCP server</html>', { 'content-type': 'text/html' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /valid MCP/i);
}

// --- 13. pingMcpServer: network throw comes back as ok:false, never propagates ---------
{
  const result = await pingMcpServer({
    serverUrl: 'https://mcp.example.com/rpc',
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND mcp.example.com');
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /ENOTFOUND/);
}

// --- 14. pingMcpServer: an AbortError (timeout) reads as a plain-English timeout --------
{
  const result = await pingMcpServer({
    serverUrl: 'https://mcp.example.com/rpc',
    fetchImpl: async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /timed out/i);
}

// --- 15. checkMcpConnection: stdio is explicitly refused, never silently "succeeds" -----
{
  const result = await checkMcpConnection({ transport: 'stdio', command: 'rm -rf /' }, { fetchImpl: async () => jsonRes(200, {}) });
  assert.equal(result.ok, false);
  assert.match(result.error, /not executed/i);
}

// --- 16. checkMcpConnection: sse is explicitly flagged as a follow-up, not half-faked ----
{
  const result = await checkMcpConnection({ transport: 'sse', server_url: 'https://mcp.example.com/sse' }, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /follow-up/i);
}

// --- 17. checkMcpConnection: http dispatches to a real pingMcpServer call --------------
{
  const result = await checkMcpConnection(
    { transport: 'http', server_url: 'https://mcp.example.com/rpc', auth_type: 'none' },
    { fetchImpl: async () => jsonRes(200, { jsonrpc: '2.0', id: 'axon-initialize-1', result: { serverInfo: { name: 'Real' } } }) },
  );
  assert.equal(result.ok, true);
  assert.equal(result.serverInfo.name, 'Real');
}

console.log('mcp-client.test.mjs OK');
