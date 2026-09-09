/**
 * Per-account MCP (Model Context Protocol) server connections
 * (axon_account_mcp_servers — db/axon-v0/006_mcp_connections.sql).
 *
 * Lets one account paste in an MCP server's connection details (URL + auth) and have it
 * stored — encrypted, wired, and immediately usable — instead of filing a "request" that
 * waits on manual follow-up. Same encryption convention as lib/axon-account-keys.mjs
 * (AES-256-GCM, key derived from AXON_KEYSTORE_SECRET); the encrypt/decrypt primitives are
 * imported from there directly rather than re-implemented, since they were already generic
 * (a named provider key vs. a named MCP credential is the same shape of secret).
 *
 * NO CREDENTIAL EVER LEAVES THIS MODULE'S DECRYPT PATH. Every function a UI-facing route
 * calls returns credential_last4 at most, never the plaintext.
 *
 * Plain .mjs, same convention as lib/axon-account-keys.mjs and lib/axon-v0/mcp-supabase.mjs:
 * importable from raw `node` (this file's own test, tests/mcp-connections.test.mjs) with no
 * TS loader.
 */
import { createSupabaseClient } from '../supabase.mjs';
import { encryptProviderKey, decryptProviderKey, last4Of } from '../axon-account-keys.mjs';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const TABLE = 'axon_account_mcp_servers';

export const MCP_TRANSPORTS = ['http', 'sse', 'stdio'];
export const MCP_AUTH_TYPES = ['none', 'bearer', 'api_key', 'basic'];

function sb(supabaseKey) {
  return createSupabaseClient(supabaseKey);
}

/**
 * Validates a paste-in spec before it ever touches the database or the network. Pure — no
 * I/O — so it is cheap to unit test on its own.
 * @param {object} spec
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateMcpConnectionSpec(spec) {
  const name = String(spec?.name || '').trim();
  const transport = String(spec?.transport || 'http').trim();
  const serverUrl = String(spec?.serverUrl || '').trim();
  const command = String(spec?.command || '').trim();
  const authType = String(spec?.authType || 'none').trim();

  if (!name) return { valid: false, reason: 'Give this MCP server a name.' };
  if (name.length > 120) return { valid: false, reason: 'Name is too long.' };
  if (!MCP_TRANSPORTS.includes(transport)) {
    return { valid: false, reason: `Unknown transport: ${transport}` };
  }
  if ((transport === 'http' || transport === 'sse') && !serverUrl) {
    return { valid: false, reason: 'This transport needs a server URL.' };
  }
  if (serverUrl) {
    try {
      const u = new URL(serverUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { valid: false, reason: 'Server URL must be http:// or https://' };
      }
    } catch {
      return { valid: false, reason: 'That does not look like a valid URL.' };
    }
  }
  if (transport === 'stdio' && !command) {
    return { valid: false, reason: 'This transport needs a command.' };
  }
  if (!MCP_AUTH_TYPES.includes(authType)) {
    return { valid: false, reason: `Unknown auth type: ${authType}` };
  }
  if (authType !== 'none' && !String(spec?.credential || '').trim()) {
    return { valid: false, reason: 'This auth type needs a credential.' };
  }
  return { valid: true };
}

/**
 * Strips the row down to what a UI is ever allowed to see — never credential_ciphertext.
 * @param {Record<string, any>|null} row
 */
export function toPublicRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    serverUrl: row.server_url ?? null,
    command: row.transport === 'stdio' ? row.command ?? null : null,
    authType: row.auth_type,
    headerName: row.header_name ?? null,
    hasCredential: !!row.credential_ciphertext,
    credentialLast4: row.credential_last4 ?? null,
    status: row.status,
    lastCheckedAt: row.last_checked_at ?? null,
    lastError: row.last_error ?? null,
    serverInfo: row.server_info ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists an account's connections. Never throws — an unreachable table reads as []. */
export async function listMcpConnections(supabaseKey, accountId) {
  if (!accountId) return [];
  try {
    const rows = await sb(supabaseKey).sbSelect(
      TABLE,
      `select=*&account_id=eq.${accountId}&order=created_at.asc`,
    );
    return Array.isArray(rows) ? rows.map(toPublicRow) : [];
  } catch {
    return [];
  }
}

/**
 * One connection's full row (server-side only — includes the ciphertext, never decrypted here).
 * @returns {Promise<Record<string, any>|null>}
 */
export async function getMcpConnectionRow(supabaseKey, accountId, id) {
  if (!accountId || !id) return null;
  try {
    const rows = await sb(supabaseKey).sbSelect(
      TABLE,
      `select=*&account_id=eq.${accountId}&id=eq.${id}&limit=1`,
    );
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Decrypts one connection's credential for actually calling the server. Never returned to a UI.
 * @param {{credential_ciphertext?: string|null}|null} row
 * @returns {string|null}
 */
export function decryptMcpCredential(row) {
  if (!row?.credential_ciphertext) return null;
  return decryptProviderKey(row.credential_ciphertext);
}

/**
 * Creates a new connection row. The credential (if any) is encrypted before it ever reaches
 * Supabase; the plaintext is handed back ONLY in the return value of this one call (so the
 * caller can immediately attempt a live handshake with it) and is never stored anywhere else.
 * @returns {Promise<{ok: boolean, row?: Record<string, any>, reason?: string}>}
 */
export async function createMcpConnection(supabaseKey, accountId, spec) {
  if (!accountId) return { ok: false, reason: 'No account to attach this connection to.' };
  const check = validateMcpConnectionSpec(spec);
  if (!check.valid) return { ok: false, reason: check.reason };

  const credential = String(spec.credential || '').trim();
  let credential_ciphertext = null;
  let credential_last4 = null;
  if (credential) {
    try {
      credential_ciphertext = encryptProviderKey(credential);
      credential_last4 = last4Of(credential);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'Could not encrypt that credential.' };
    }
  }

  const body = {
    account_id: accountId,
    name: String(spec.name).trim(),
    transport: spec.transport || 'http',
    server_url: spec.serverUrl ? String(spec.serverUrl).trim() : null,
    command: spec.transport === 'stdio' ? String(spec.command || '').trim() || null : null,
    auth_type: spec.authType || 'none',
    header_name: spec.headerName ? String(spec.headerName).trim() : null,
    credential_ciphertext,
    credential_last4,
    status: 'pending',
  };

  try {
    const row = await sb(supabaseKey).sbInsert(TABLE, body);
    return { ok: true, row };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|already exists|23505/i.test(msg)) {
      return { ok: false, reason: `A connection named "${body.name}" already exists.` };
    }
    return { ok: false, reason: 'Could not save that connection right now.' };
  }
}

/**
 * Records a handshake outcome against an existing row. Never stores the credential again.
 * @param {string} supabaseKey
 * @param {string} accountId
 * @param {string} id
 * @param {{ok: boolean, serverInfo?: object, error?: string}} outcome - a checkMcpConnection()
 *   result (lib/axon-v0/mcp-client.mjs); only these three fields are read.
 * @returns {Promise<Record<string, any>|null>}
 */
export async function recordMcpCheckResult(supabaseKey, accountId, id, { ok, serverInfo, error }) {
  if (!accountId || !id) return null;
  const patch = {
    status: ok ? 'connected' : 'error',
    last_checked_at: new Date().toISOString(),
    last_error: ok ? null : String(error || 'Could not reach that server.').slice(0, 500),
    server_info: ok ? serverInfo ?? {} : {},
    updated_at: new Date().toISOString(),
  };
  try {
    const row = await sb(supabaseKey).sbPatch(TABLE, `account_id=eq.${accountId}&id=eq.${id}`, patch);
    return row;
  } catch {
    return null;
  }
}

/** Deletes one connection. Returns true only if a row actually existed and was removed. */
export async function deleteMcpConnection(supabaseKey, accountId, id) {
  if (!accountId || !id) return false;
  try {
    const deleted = await sb(supabaseKey).sbDelete(TABLE, `account_id=eq.${accountId}&id=eq.${id}`);
    return Array.isArray(deleted) && deleted.length > 0;
  } catch {
    return false;
  }
}

/** Looks up one connection by name (for agent tool-calling — lib/axon-agent-bus.mjs's mcp_ping). */
export async function getMcpConnectionByName(supabaseKey, accountId, name) {
  if (!accountId || !name) return null;
  try {
    const rows = await sb(supabaseKey).sbSelect(
      TABLE,
      `select=*&account_id=eq.${accountId}&name=eq.${encodeURIComponent(name)}&limit=1`,
    );
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch {
    return null;
  }
}

export { SUPABASE_URL as MCP_CONNECTIONS_SUPABASE_URL };
