/**
 * Outreach HQ "Generate Leads" — hands the request to the OUTREACH agent over
 * `agent_bus` (NI-Brain). Rewired 2026-09-05 (Decision #1767): the old path
 * dispatched the GitHub Actions workflow `axon-ni-outreach.yml`, which was
 * retired with the AXON-NI-Outreach job. OUTREACH is the one owner of outreach
 * for every venture now; it reads its bus inbox at boot and on every run, so a
 * row here is the same as pressing its button.
 *
 * Plain .mjs on purpose (runs under Next.js and raw node; mirrored byte-for-byte
 * at northside-intelligence/src/lib/axon/outreach-run-core.mjs).
 */
const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const BUS_SUBJECT = 'OUTREACH-run-request';
const FROM_AGENT = 'AXON';
const TO_AGENT = 'OUTREACH';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function sbHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    ...extra,
  };
}

function clampMax(max) {
  const n = Number.parseInt(String(max ?? 3), 10);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(10, n); // 10 pending leads per venture is the JB cap (2026-09-05)
}

/**
 * Queue one outreach run request for the OUTREACH agent.
 * Returns the same shape the API route always returned; `actionsUrl` now points
 * at the bus row instead of a GitHub Actions page.
 */
export async function dispatchOutreachRun({ max = 3, venture = 'ni' } = {}) {
  const key = getSupabaseKey();
  if (!key) {
    throw new Error('Outreach handoff is not configured on this deploy yet — the request could not reach the OUTREACH agent.');
  }
  const maxN = clampMax(max);
  const body = {
    kind: 'outreach_run_request',
    venture,
    max: maxN,
    source: 'outreach-hq',
    requested_at: new Date().toISOString(),
    note: 'Generate up to `max` new leads for this venture, respecting the 10-pending-per-venture cap. Reply on this row when done.',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_bus`, {
    method: 'POST',
    headers: sbHeaders(key, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify([{ from_agent: FROM_AGENT, to_agent: TO_AGENT, subject: BUS_SUBJECT, body, needs_answer: true, status: 'open' }]),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Could not hand the run to OUTREACH (${res.status}): ${detail.slice(0, 240)}`);
  }
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    ok: true,
    max: maxN,
    busId: row?.id || null,
    actionsUrl: row?.id ? `agent_bus:${row.id}` : 'agent_bus',
  };
}

/** Latest run request for UI status (best-effort), read back from the bus. */
export async function fetchLatestOutreachRun() {
  const key = getSupabaseKey();
  if (!key) return { configured: false, run: null };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_bus?select=id,status,answered_by,answered_at,created_at,body&subject=eq.${encodeURIComponent(BUS_SUBJECT)}&order=created_at.desc&limit=1`,
    { headers: sbHeaders(key) },
  );
  if (!res.ok) return { configured: true, run: null };
  const data = await res.json();
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { configured: true, run: null };
  const done = row.status === 'answered';
  return {
    configured: true,
    run: {
      id: row.id,
      status: done ? 'completed' : 'queued',
      conclusion: done ? 'success' : null,
      htmlUrl: '',
      createdAt: row.created_at,
      event: 'outreach-hq',
    },
  };
}
