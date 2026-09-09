/**
 * Real MCP (Model Context Protocol) handshake — proves a pasted-in server is actually live.
 *
 * SCOPE, STATED HONESTLY: this sends a genuine JSON-RPC 2.0 `initialize` request per the MCP
 * spec (https://modelcontextprotocol.io) over the "Streamable HTTP" transport — a single POST
 * to the server's URL, Accept negotiated for either a JSON or an SSE-framed reply, real
 * protocol version negotiation, real auth headers built from the account's decrypted
 * credential. Nothing here is a mock or a canned "connected" response — a server that
 * is not actually an MCP endpoint, is down, or rejects the credential comes back ok:false
 * with the real reason.
 *
 * NOT covered by this pass (flagged, not faked):
 *   - `transport: 'sse'` (the legacy two-connection SSE transport, superseded by Streamable
 *     HTTP but still run by some older servers) — the handshake it needs is a GET that opens
 *     a long-lived stream, reads an `endpoint` event, then POSTs to THAT url and reads the
 *     reply back over the original GET stream. That's a real, different protocol shape this
 *     pass does not implement; pingMcpServer() says so honestly instead of guessing.
 *   - `transport: 'stdio'` — spawning an arbitrary command a multi-tenant web user pasted in
 *     is a remote-code-execution risk in a shared server process, so it is never executed
 *     here. The command is stored (lib/axon-v0/mcp-connections.mjs) for a future sandboxed
 *     local-runner build.
 *   - Actually calling one of the server's tools (tools/list, tools/call) once connected —
 *     this proves LIVENESS (the handshake), not full tool-call passthrough. See the PR
 *     description for that follow-up.
 *
 * Plain .mjs, no framework import, so this is cheap to unit test with a mocked fetch
 * (tests/mcp-client.test.mjs) and safe to call from either a Next.js route or
 * lib/axon-agent-bus.mjs's tool-call handling.
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_CLIENT_INFO = { name: 'axon', version: '0.2.0' };
const DEFAULT_TIMEOUT_MS = 8000;

/** Builds the auth header(s) for one connection. Never logs or returns the credential itself. */
export function buildAuthHeaders({ authType, credential, headerName }) {
  const cred = String(credential || '').trim();
  if (!cred || !authType || authType === 'none') return {};
  if (authType === 'bearer') return { Authorization: `Bearer ${cred}` };
  if (authType === 'api_key') return { [headerName?.trim() || 'X-Api-Key']: cred };
  if (authType === 'basic') {
    // Credential is expected as "username:password"; base64 it whole. A credential with no
    // colon still encodes (as a password with an empty username) rather than throwing —
    // callers get a real 401 back from the server instead of a client-side guess.
    const b64 = Buffer.from(cred, 'utf8').toString('base64');
    return { Authorization: `Basic ${b64}` };
  }
  return {};
}

function parseSseFirstDataFrame(text) {
  // Minimal SSE line parser: find the first `data: ...` line and JSON.parse it. Streamable
  // HTTP servers that answer a single POST with an SSE-framed body send exactly one event.
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('data:')) {
      const payload = line.slice(5).trim();
      if (payload) return JSON.parse(payload);
    }
  }
  throw new Error('no data frame in SSE response');
}

/**
 * Real `initialize` handshake against an MCP server's HTTP endpoint (Streamable HTTP
 * transport). Never throws — every failure mode comes back as `{ ok: false, error }`.
 *
 * @param {object} args
 * @param {string} args.serverUrl
 * @param {'none'|'bearer'|'api_key'|'basic'} [args.authType]
 * @param {string|null} [args.credential] - decrypted plaintext, used once and discarded
 * @param {string|null} [args.headerName]
 * @param {number} [args.timeoutMs]
 * @param {typeof fetch} [args.fetchImpl] - injectable for tests; defaults to global fetch
 * @returns {Promise<{ok: boolean, protocolVersion?: string, serverInfo?: object,
 *   capabilities?: object, error?: string, httpStatus?: number}>}
 */
export async function pingMcpServer({
  serverUrl,
  authType = 'none',
  credential = null,
  headerName = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl,
} = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { ok: false, error: 'No fetch implementation available.' };
  if (!serverUrl) return { ok: false, error: 'No server URL to connect to.' };

  let url;
  try {
    url = new URL(serverUrl);
  } catch {
    return { ok: false, error: 'That is not a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Server URL must be http:// or https://' };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const body = {
    jsonrpc: '2.0',
    id: 'axon-initialize-1',
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: MCP_CLIENT_INFO,
    },
  };

  try {
    const res = await doFetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...buildAuthHeaders({ authType, credential, headerName }),
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    const contentType = res.headers?.get?.('content-type') || '';
    const text = await res.text();

    if (!res.ok) {
      // Truncate — an error page's HTML/JSON should never blow up the stored last_error.
      return {
        ok: false,
        httpStatus: res.status,
        error: `Server responded HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      };
    }

    let parsed;
    try {
      parsed = contentType.includes('text/event-stream') ? parseSseFirstDataFrame(text) : JSON.parse(text);
    } catch {
      return { ok: false, httpStatus: res.status, error: 'Server did not return a valid MCP JSON-RPC response.' };
    }

    if (parsed?.error) {
      const msg = parsed.error?.message || 'Server rejected the initialize request.';
      return { ok: false, httpStatus: res.status, error: String(msg).slice(0, 300) };
    }
    if (!parsed?.result) {
      return { ok: false, httpStatus: res.status, error: 'Response had no MCP result — not an MCP server?' };
    }

    const result = parsed.result;
    return {
      ok: true,
      httpStatus: res.status,
      protocolVersion: typeof result.protocolVersion === 'string' ? result.protocolVersion : null,
      serverInfo: result.serverInfo && typeof result.serverInfo === 'object' ? result.serverInfo : {},
      capabilities:
        result.capabilities && typeof result.capabilities === 'object' ? Object.keys(result.capabilities) : [],
    };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: `Timed out after ${timeoutMs}ms waiting for that server.` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Could not reach that server.' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Single entry point recordMcpCheckResult-shaped callers use — dispatches by transport and
 * is explicit (not silent) about the two transports this pass does not execute.
 * @param {{transport?: string, server_url?: string|null, auth_type?: string|null,
 *   header_name?: string|null}} row - an axon_account_mcp_servers row (or the shape of one)
 * @param {object} [opts]
 * @param {string|null} [opts.credential] - decrypted plaintext, used once and discarded
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok: boolean, error?: string, serverInfo?: object, capabilities?: object,
 *   protocolVersion?: string, httpStatus?: number}>}
 */
export async function checkMcpConnection(row, { credential = null, fetchImpl, timeoutMs } = {}) {
  const transport = row?.transport || 'http';
  if (transport === 'stdio') {
    return {
      ok: false,
      error:
        'stdio servers are stored but not executed from this multi-tenant environment (would be arbitrary command execution) — this is a flagged follow-up, not a live check.',
    };
  }
  if (transport === 'sse') {
    return {
      ok: false,
      error:
        'The legacy SSE transport needs a two-connection handshake this pass does not implement yet — flagged follow-up. Use an "http" (Streamable HTTP) server URL for a live check today.',
    };
  }
  return pingMcpServer({
    serverUrl: row?.server_url,
    authType: row?.auth_type || 'none',
    credential,
    headerName: row?.header_name || null,
    fetchImpl,
    timeoutMs,
  });
}
