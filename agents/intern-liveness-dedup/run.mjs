#!/usr/bin/env node
// AXON Intern Agent runner: Liveness Dedup Auditor.
//
// Usage:
//   node run.mjs < rows.json                 -> prints report JSON to stdout
//   cat rows.json | node run.mjs --bus        -> also POSTs a summary row to
//                                                agent_bus IF Supabase REST
//                                                credentials are present in
//                                                the environment (SUPABASE_URL
//                                                + SUPABASE_SERVICE_ROLE_KEY).
//                                                Otherwise it just warns and
//                                                still prints the report, so
//                                                the caller can hand the
//                                                report off manually. This is
//                                                the intern's whole job: it
//                                                never mutates agent_dispatch,
//                                                and it degrades safely with
//                                                no credentials.
//
// Input contract: a JSON array of agent_dispatch rows, minimally shaped
// { id, code, status, owner, created_at }. Rows are expected to already be
// filtered to status='queued' and code LIKE 'LIVE-%' OR 'LOOP-LIVE-%' —
// this agent does not query the DB itself when run in stdin mode, keeping
// it usable anywhere Node runs, with or without DB credentials.

import { analyze } from './lib.mjs';

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function maybeEmitToBus(report) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      '[intern-liveness-dedup] no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in env — skipping agent_bus write, report printed to stdout only.'
    );
    return { emitted: false, reason: 'no_credentials' };
  }

  const body = {
    from_agent: 'AXON-INTERN-LIVENESS-DEDUP',
    to_agent: 'BUILD',
    subject: 'intern-liveness-dedup-report',
    body: JSON.stringify(report),
  };

  const res = await fetch(`${url}/rest/v1/agent_bus`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[intern-liveness-dedup] agent_bus insert failed: ${res.status} ${text}`);
    return { emitted: false, reason: `http_${res.status}` };
  }

  return { emitted: true };
}

async function main() {
  const raw = await readStdin();
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch (err) {
    console.error('[intern-liveness-dedup] input was not valid JSON:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(rows)) {
    console.error('[intern-liveness-dedup] expected a JSON array of dispatch rows.');
    process.exit(1);
  }

  const report = analyze(rows);
  const wantsBus = process.argv.includes('--bus');

  if (wantsBus) {
    const busResult = await maybeEmitToBus(report);
    report._bus = busResult;
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[intern-liveness-dedup] fatal:', err);
  process.exit(1);
});
