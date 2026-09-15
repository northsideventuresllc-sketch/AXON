#!/usr/bin/env node
// nvg-set-agent-name.mjs — record THIS fired session's canonical agent name so the
// tickets-first PreToolUse gate can enforce even when NVG_AGENT_NAME is not in the
// environment.
//
// WHY THIS EXISTS (ENFORCE-GATES-FIRE-IN-FIRED-SESSIONS-0908, audit 2026-09-08):
//   A fired cloud session does NOT expose its routine/trigger id anywhere the session
//   can read (verified: not in env, not in the session ingress JWT, not in git state),
//   so a boot hook CANNOT look the agent name up from nvg_agent_routines on its own.
//   And the Claude Code cloud "cloud_default" environment injects env vars/secrets at
//   the ENVIRONMENT level (shared by every routine), so a per-agent NVG_AGENT_NAME
//   cannot be set there either. The ONE place the agent name reliably exists is the
//   routine's own prompt (each routine names its agent, e.g. "You are EXEC"). This
//   script lets the agent write that name to a small state file the gate reads as a
//   fallback to the env var — so JB does not have to set NVG_AGENT_NAME per routine.
//
// USAGE (agent runs this ONCE, early in boot, right after confirming its canonical
// name from v_bus_inbox / its own prompt):
//   node <path>/nvg-set-agent-name.mjs EXEC
//
// The gate prefers process.env.NVG_AGENT_NAME when set; this file is only the fallback.
// Writing it is idempotent and safe to repeat.

import fs from 'node:fs';
import path from 'node:path';

const name = (process.argv[2] || '').trim();
if (!name) {
  console.error('nvg-set-agent-name: no name given. Usage: node nvg-set-agent-name.mjs <AGENT_NAME>');
  process.exit(1);
}
// Reject anything that isn't a plain agent label — this value is used only for a DB
// filter, never shell-interpolated, but keep it clean anyway.
if (!/^[A-Za-z0-9 _.-]{1,60}$/.test(name)) {
  console.error(`nvg-set-agent-name: refusing suspicious name ${JSON.stringify(name)}`);
  process.exit(1);
}

// PROJECT resolves to the session's project root in BOTH launch modes:
//   - multi-repo root  -> /home/user            (CLAUDE_PROJECT_DIR=/home/user)
//   - Option A (nv-vault root) -> /home/user/nv-vault
// The tickets-first gate reads its state from the same PROJECT/.nvg dir, so writing
// the name there is exactly where the gate will look.
const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dir = path.join(PROJECT, '.nvg');
const file = path.join(dir, 'agent-name');

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, name + '\n');
console.log(`nvg-set-agent-name: recorded ${name} -> ${file}`);
