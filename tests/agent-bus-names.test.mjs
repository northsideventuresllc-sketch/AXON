// AXON-BUS-NAME-CANON-0902: proves every hardcoded `from_agent` string literal
// under scripts/ and lib/ is either the canonical roster name (lib/agent-names.mjs)
// or an explicitly allowlisted non-roster sender (e.g. the dashboard UI, which
// posts to agent_bus but is not itself an AXON roster job).
//
// This test reads source text with a regex rather than importing every script
// (several of those scripts run/dispatch on import) — it's a drift guard, not
// a runtime check.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENT } from '../lib/agent-names.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const CANONICAL = new Set(Object.values(AGENT));

// Legitimate agent_bus senders that are not AXON roster jobs, so they are not
// (and should not be) in lib/agent-names.mjs's AGENT map.
const ALLOWLIST = new Set([
  'AXON-v0-Dash', // the dashboard UI itself firing a roster action, not a roster job
]);

const SCAN_DIRS = ['scripts', 'lib'];
const FROM_AGENT_RE = /from_agent\s*:\s*'([^']+)'|from_agent\s*:\s*"([^"]+)"/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.(mjs|js|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const offenders = [];

for (const dir of SCAN_DIRS) {
  const dirPath = path.join(repoRoot, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const file of walk(dirPath)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(FROM_AGENT_RE)) {
      const value = match[1] ?? match[2];
      if (!CANONICAL.has(value) && !ALLOWLIST.has(value)) {
        offenders.push(`${path.relative(repoRoot, file)}: from_agent: '${value}'`);
      }
    }
  }
}

assert.deepEqual(
  offenders,
  [],
  `Non-canonical from_agent literal(s) found — use lib/agent-names.mjs's AGENT constants ` +
    `or add to the ALLOWLIST in this test if genuinely not a roster job:\n${offenders.join('\n')}`
);

console.log('agent-bus-names.test.mjs passed');
