/**
 * muse-intake.mjs — MUSE backup-harness work intake.
 *
 * Reads the shared queue (v_bus_inbox view over agent_bus) for open,
 * unclaimed work addressed to MUSE or ALL, oldest first.
 *
 * Rules (from the onboarding brief):
 *  - Clear owned/assigned tickets oldest-first before new work.
 *  - Only pick up a ticket the primary harness has NOT claimed
 *    (claimed_by IS NULL). Never steal a live claim.
 *  - Claim via fn_bus_claim BEFORE working. Release on failure.
 *
 * Auth: SUPABASE_SERVICE_KEY env var (service role). Never hardcode a key.
 * LLM calls from any work this intake leads to go through
 * nv-vault scripts/lib/axon-llm.mjs. ESM only.
 *
 * Usage:
 *   node scripts/muse-intake.mjs peek          # list claimable tickets (no claim)
 *   node scripts/muse-intake.mjs claim         # claim oldest claimable ticket, print it
 *   node scripts/muse-intake.mjs release <id>  # release a ticket held by MUSE
 */

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';
const AGENT = 'MUSE';

function key() {
  const k = process.env.SUPABASE_SERVICE_KEY;
  if (!k) throw new Error('muse-intake: SUPABASE_SERVICE_KEY env var is required');
  return k;
}
const H = (k) => ({
  apikey: k,
  Authorization: `Bearer ${k}`,
  'Content-Type': 'application/json',
});

async function inbox(k, { owned = false } = {}) {
  const claimed = owned ? 'claimed_by=eq.MUSE' : 'claimed_by=is.null';
  const q = `status=eq.open&or=(to_agent.eq.MUSE,to_agent.eq.ALL)&${claimed}&order=created_at.asc&select=id,from_agent,to_agent,subject,created_at,claimed_by,expires_at`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/v_bus_inbox?${q}`, { headers: H(k) });
  if (!r.ok) throw new Error(`inbox read failed: HTTP ${r.status}`);
  return r.json();
}

async function claim(k, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_bus_claim`, {
    method: 'POST',
    headers: H(k),
    body: JSON.stringify({ p_id: id, p_agent: AGENT }),
  });
  if (!r.ok) throw new Error(`claim failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json(); // true = won the claim, false = someone else holds it
}

async function release(k, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/agent_bus?id=eq.${id}&claimed_by=eq.MUSE`, {
    method: 'PATCH',
    headers: { ...H(k), Prefer: 'return=representation' },
    body: JSON.stringify({ claimed_by: null, claimed_at: null, status: 'open' }),
  });
  if (!r.ok) throw new Error(`release failed: HTTP ${r.status}`);
  const rows = await r.json();
  if (!rows.length) throw new Error('release: ticket not found or not held by MUSE');
  return rows[0];
}

const cmd = process.argv[2];
try {
  const k = key();
  if (cmd === 'peek') {
    const owned = await inbox(k, { owned: true });
    const open = await inbox(k);
    console.log(JSON.stringify({ owned_by_muse: owned, claimable: open }, null, 2));
  } else if (cmd === 'claim') {
    const owned = await inbox(k, { owned: true });
    const open = await inbox(k);
    const next = [...owned, ...open][0];
    if (!next) {
      console.log(JSON.stringify({ claimed: false, reason: 'queue empty' }));
      process.exit(0);
    }
    if (next.claimed_by) {
      console.log(JSON.stringify({ claimed: true, already_owned: true, ticket: next }, null, 2));
    } else {
      const won = await claim(k, next.id);
      console.log(JSON.stringify({ claimed: !!won, ticket: won ? next : null }, null, 2));
      if (!won) process.exit(3); // lost the race; caller should stand down
    }
  } else if (cmd === 'release') {
    const id = process.argv[3];
    if (!id) throw new Error('release needs a ticket id');
    const row = await release(k, id);
    console.log(JSON.stringify({ released: true, id: row.id }));
  } else {
    console.error('usage: node scripts/muse-intake.mjs <peek|claim|release <id>>');
    process.exit(2);
  }
} catch (e) {
  console.error(`muse-intake error: ${e.message}`);
  process.exit(1);
}
