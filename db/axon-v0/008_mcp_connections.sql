-- AXON v0 — real MCP (Model Context Protocol) server connections, per account.
--
-- WHY THIS FILE EXISTS: before this, "MCP" in this codebase meant two things, neither of
-- which was a real MCP client: (1) components/axon-v0/mcp-marketplace.tsx — a curated,
-- static catalog where every entry except Supabase is a "Request" button that just flips
-- local React state (no backend row, no follow-up, nothing to action); and (2)
-- components/axon-v0/skill-mcp-creator.tsx — a free-text chat that drafts an inert
-- nvg_skill_registry row (scope='mcp') with a name + description and NO server URL or
-- credential field at all, so it can never actually connect to anything.
--
-- This table is the first REAL one: one row per (account, connection), holding the actual
-- MCP server address and — same convention as axon_account_provider_keys
-- (lib/axon-account-keys.mjs, AES-256-GCM, key derived from AXON_KEYSTORE_SECRET) — an
-- encrypted credential. Plaintext never lands in a column; only credential_last4 is safe to
-- render in a UI. See lib/axon-v0/mcp-connections.mjs for the encrypt/decrypt + CRUD layer
-- and lib/axon-v0/mcp-client.mjs for the real JSON-RPC "initialize" handshake used to prove
-- a pasted-in server is actually live.
--
-- Idempotent (create/alter ... if not exists) so this file can be re-applied safely.

create table if not exists axon_account_mcp_servers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  name text not null,
  -- 'http' | 'sse' use server_url (MCP Streamable HTTP / legacy SSE transport) — the only
  -- transports this pass actually dials. 'stdio' stores `command` for a future local-runner
  -- build (spawning an arbitrary command pasted in by a multi-tenant web user is a remote
  -- code execution risk and is deliberately NOT executed anywhere in this pass — see
  -- lib/axon-v0/mcp-client.mjs's header comment).
  transport text not null default 'http' check (transport in ('http', 'sse', 'stdio')),
  server_url text,
  command text,
  auth_type text not null default 'none' check (auth_type in ('none', 'bearer', 'api_key', 'basic')),
  -- Only meaningful for auth_type='api_key' — which header the key rides in. Defaults applied
  -- in code (lib/axon-v0/mcp-client.mjs) when null: bearer -> Authorization: Bearer <key>,
  -- api_key -> X-Api-Key: <key> unless header_name overrides it, basic -> Authorization: Basic
  -- <base64>.
  header_name text,
  credential_ciphertext text,
  credential_last4 text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  last_checked_at timestamptz,
  last_error text,
  -- Non-sensitive bits the server itself reports back on a successful `initialize` handshake
  -- (name, version, protocolVersion, capabilities) — never a credential.
  server_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, name)
);

create index if not exists axon_account_mcp_servers_account
  on axon_account_mcp_servers (account_id, created_at);

alter table axon_account_mcp_servers enable row level security;
-- Same deny-by-default posture as axon_account_provider_keys — service role only. No public
-- policies: every read/write in this repo goes through the API routes under
-- app/api/axon-v0/mcp/connections, which use the service-role key server-side.
