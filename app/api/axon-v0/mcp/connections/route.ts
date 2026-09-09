import { NextResponse } from 'next/server';
import { getAccount, supabaseKey } from '@/lib/axon-v0/store';
import { PLATFORM_ACCOUNT_ID } from '@/lib/axon-router-core.mjs';
import {
  listMcpConnections,
  createMcpConnection,
  deleteMcpConnection,
  getMcpConnectionRow,
  recordMcpCheckResult,
  decryptMcpCredential,
  toPublicRow,
} from '@/lib/axon-v0/mcp-connections.mjs';
import { checkMcpConnection } from '@/lib/axon-v0/mcp-client.mjs';

export const dynamic = 'force-dynamic';

// Real MCP server connections, per account (problem #9's general MCP path, replacing the
// "Request → wait for manual follow-up" pattern with "paste it, it's encrypted, it works
// immediately" — same pattern lib/axon-account-keys.mjs already established for provider
// keys). See db/axon-v0/006_mcp_connections.sql and lib/axon-v0/mcp-connections.mjs for the
// storage layer, lib/axon-v0/mcp-client.mjs for the real handshake used to prove liveness.
//
// GET    — list this account's connections. Never returns a credential, only last4.
// POST   — { name, transport, serverUrl, command?, authType, headerName?, credential? }
//   creates a new connection AND immediately attempts a live handshake with the credential
//   just supplied, so the row's status reflects reality (connected/error) the moment it's
//   saved — never left as an unverified "request".
//   { id, reverify: true } re-runs the handshake for an existing connection using its
//   already-stored (decrypted server-side only) credential — no credential resent.
// DELETE ?id=... — removes one connection.
//
// Fail-safe by contract, same as the sibling axon-v0 routes: any infra failure (missing
// creds, missing table, network) returns 200 with a plain-English reason, never leaks table
// names or raw error detail to the client.

async function resolveAccountId(): Promise<string> {
  const account = await getAccount();
  return account?.id ?? PLATFORM_ACCOUNT_ID;
}

export async function GET() {
  try {
    const key = supabaseKey();
    if (!key) return NextResponse.json({ connections: [] });
    const accountId = await resolveAccountId();
    const connections = await listMcpConnections(key, accountId);
    return NextResponse.json({ connections });
  } catch {
    return NextResponse.json({ connections: [] });
  }
}

export async function POST(req: Request) {
  try {
    const key = supabaseKey();
    if (!key) {
      return NextResponse.json(
        { ok: false, reason: 'The MCP connection store is not reachable right now — nothing was saved.' },
        { status: 200 },
      );
    }
    const accountId = await resolveAccountId();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Re-verify an existing connection — no credential resent, decrypted server-side only.
    if (body && body.reverify === true) {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) return NextResponse.json({ ok: false, reason: 'No connection specified.' }, { status: 200 });
      const row = await getMcpConnectionRow(key, accountId, id);
      if (!row) return NextResponse.json({ ok: false, reason: 'That connection no longer exists.' }, { status: 200 });

      const credential = decryptMcpCredential(row);
      const result = await checkMcpConnection(row, { credential });
      const updated = await recordMcpCheckResult(key, accountId, id, result);
      return NextResponse.json({
        ok: true,
        verified: result.ok,
        reason: result.ok ? null : result.error,
        connection: toPublicRow(updated || { ...row, status: result.ok ? 'connected' : 'error' }),
      });
    }

    const spec = {
      name: body.name,
      transport: body.transport || 'http',
      serverUrl: body.serverUrl,
      command: body.command,
      authType: body.authType || 'none',
      headerName: body.headerName,
      credential: body.credential,
    };

    const created = await createMcpConnection(key, accountId, spec);
    if (!created.ok || !created.row) {
      return NextResponse.json({ ok: false, reason: created.reason || 'Could not save that connection.' }, { status: 200 });
    }

    // Immediately prove it's live — the credential we just encrypted is still in hand as
    // plaintext right here, so the very first check needs no round-trip decrypt.
    const result = await checkMcpConnection(created.row, {
      credential: typeof spec.credential === 'string' ? spec.credential.trim() || null : null,
    });
    const updated = await recordMcpCheckResult(key, accountId, created.row.id, result);

    return NextResponse.json({
      ok: true,
      verified: result.ok,
      reason: result.ok ? null : result.error,
      connection: toPublicRow(updated || { ...created.row, status: result.ok ? 'connected' : 'error' }),
    });
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'Could not save that connection right now.' },
      { status: 200 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const key = supabaseKey();
    if (!key) {
      return NextResponse.json(
        { ok: false, reason: 'The MCP connection store is not reachable right now.' },
        { status: 200 },
      );
    }
    const accountId = await resolveAccountId();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    if (!id) return NextResponse.json({ ok: false, reason: 'No connection specified.' }, { status: 200 });

    const removed = await deleteMcpConnection(key, accountId, id);
    return NextResponse.json({ ok: removed, reason: removed ? null : 'That connection was already gone.' });
  } catch {
    return NextResponse.json(
      { ok: false, reason: 'Could not remove that connection right now.' },
      { status: 200 },
    );
  }
}
