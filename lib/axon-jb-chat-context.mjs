/**
 * TELEGRAM-CHAT-GROUNDED-0906 — the context AXON reads before answering JB in
 * his private Telegram chat.
 *
 * Why this exists: on 2026-09-06 JB asked "What needs me? Please ask" and the
 * assistant invented three items that exist nowhere in NI-Brain, then agreed
 * with every push-back and created nothing. Root cause: the reply had no data
 * behind it at all — the only context ever handed to the model was the outreach
 * lead pipeline, so anything else was free-form invention.
 *
 * Every block below is read live per message through the existing sbSelect
 * PostgREST helper, bounded and cheap (five small selects, hard row limits),
 * and the whole thing is capped so a long backlog can never blow the prompt.
 * If a read fails, its block says so — it never silently becomes an empty list
 * that reads like "nothing is wrong".
 */

export const CONTEXT_CHAR_CAP = 2500;

const DISPATCH_LIMIT = 12;
const PING_LIMIT = 20;
const TAP_LIMIT = 50;
const ROUTINE_LIMIT = 8;
const TITLE_CHARS = 140;
const CLOSE_OUT_CHARS = 300;

function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Whole days between a timestamp and now, floored at 0. */
export function ageInDays(created, now = new Date()) {
  const then = new Date(created).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

export function plainAge(days) {
  if (days == null) return '';
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/** One waiting item, said the way JB reads it — no codes, no table names. */
export function describeWaitingItem(item) {
  const age = plainAge(item.ageDays);
  const who = item.owner ? ` — ${item.owner} is holding it` : '';
  return `${item.label}${who}${age ? `, waiting ${age}` : ''}.`;
}

async function safe(fn, fallback) {
  try {
    const out = await fn();
    return { ok: true, value: out ?? fallback };
  } catch (err) {
    return { ok: false, value: fallback, error: err?.message || 'read failed' };
  }
}

/**
 * (a) Tickets that name JB: status needs_jb, or flagged for his approval and
 * not already finished or turned down.
 */
async function readNeedsJb(sbSelect, now) {
  return safe(async () => {
    const rows = await sbSelect(
      'agent_dispatch',
      'select=code,title,owner,status,needs_jb_approval,created_at'
        + '&or=(status.eq.needs_jb,needs_jb_approval.is.true)'
        + '&status=not.in.(done,rejected,skipped)'
        + `&order=created_at.desc&limit=${DISPATCH_LIMIT}`,
    );
    return (rows || []).map((r) => ({
      kind: 'task',
      id: r.code,
      label: clip(r.title, TITLE_CHARS),
      owner: r.owner || null,
      createdAt: r.created_at,
      ageDays: ageInDays(r.created_at, now),
    }));
  }, []);
}

/**
 * (b) Approval pings already sent to Telegram whose button has never been
 * tapped. Shape confirmed live: a ping carries metadata.dispatch_id +
 * dispatch_code + agent_name; every inbound tap is logged as its own row with
 * metadata.target_id and metadata.valid, written before the button is answered.
 */
async function readPendingApprovals(sbSelect, now) {
  return safe(async () => {
    const [pings, taps] = await Promise.all([
      sbSelect(
        'axon_telegram_messages',
        'select=content,metadata,created_at&message_type=eq.approval_ping'
          + `&order=created_at.desc&limit=${PING_LIMIT}`,
      ),
      sbSelect(
        'axon_telegram_messages',
        'select=metadata,created_at&message_type=eq.approval_tap'
          + `&order=created_at.desc&limit=${TAP_LIMIT}`,
      ),
    ]);
    const tapped = new Set(
      (taps || [])
        .filter((t) => t?.metadata?.valid !== false)
        .map((t) => t?.metadata?.target_id)
        .filter(Boolean),
    );
    const seen = new Set();
    const out = [];
    for (const p of pings || []) {
      const id = p?.metadata?.dispatch_id;
      if (!id || tapped.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({
        kind: 'approval',
        id,
        label: clip(p.content || p?.metadata?.dispatch_code || 'an approval', TITLE_CHARS),
        owner: p?.metadata?.agent_name || null,
        createdAt: p.created_at,
        ageDays: ageInDays(p.created_at, now),
      });
    }
    return out;
  }, []);
}

/** (c) Active agents whose last health check came back as anything but healthy. */
async function readFleetHealth(sbSelect) {
  return safe(async () => {
    const rows = await sbSelect(
      'nvg_agent_routines',
      'select=agent_name,health_status,health_note&active=is.true&retired_at=is.null'
        + `&health_status=not.in.(healthy)&order=agent_name.asc&limit=${ROUTINE_LIMIT}`,
    );
    return (rows || [])
      .filter((r) => r.health_status)
      .map((r) => ({ name: r.agent_name, word: String(r.health_status).replace(/_/g, ' ') }));
  }, []);
}

/** (d) The newest close-out note any agent wrote. */
async function readLastCloseOut(sbSelect, now) {
  return safe(async () => {
    const rows = await sbSelect(
      'session_notes_apartment',
      'select=raw_note,workspace_type,created_at&order=created_at.desc&limit=1',
    );
    const row = (rows || [])[0];
    if (!row) return null;
    return {
      note: clip(row.raw_note, CLOSE_OUT_CHARS),
      what: row.workspace_type || null,
      ageDays: ageInDays(row.created_at, now),
    };
  }, null);
}

/**
 * Reads all five blocks live. Returns the structured facts AND the labelled
 * text handed to the model, so a deterministic answer and the model see exactly
 * the same picture.
 */
export async function buildJbChatContext(
  sbSelect,
  { now = new Date(), pipelineContext = '', pipelineFailed = false } = {},
) {
  const [needsJb, approvals, fleet, closeOut] = await Promise.all([
    readNeedsJb(sbSelect, now),
    readPendingApprovals(sbSelect, now),
    readFleetHealth(sbSelect),
    readLastCloseOut(sbSelect, now),
  ]);
  const pipeline = { ok: !pipelineFailed, value: pipelineContext || '' };

  const facts = {
    needsJb: needsJb.value,
    approvals: approvals.value,
    fleet: fleet.value,
    closeOut: closeOut.value,
    pipeline: pipeline.value,
    // Which reads came back empty because they failed, not because there is
    // nothing there — the difference JB has to be told about.
    failed: {
      needsJb: !needsJb.ok,
      approvals: !approvals.ok,
      fleet: !fleet.ok,
      closeOut: !closeOut.ok,
      pipeline: !pipeline.ok,
    },
    failures: [needsJb, approvals, fleet, closeOut, pipeline].filter((r) => !r.ok).length,
  };
  facts.waiting = [...facts.needsJb, ...facts.approvals].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  facts.text = renderContext(facts, { needsJb, approvals, fleet, closeOut, pipeline });
  return facts;
}

/** Every block says this the same way — an unread block never reads as an empty one. */
export const UNREADABLE = '(could not be read this time)';

function renderBlock(title, lines) {
  return `${title}\n${lines.length ? lines.join('\n') : '(nothing)'}`;
}

export function renderContext(facts, reads = {}) {
  const blocks = [];

  blocks.push(renderBlock(
    'WAITING ON JB — tasks that name him (newest first):',
    reads.needsJb && reads.needsJb.ok === false
      ? [UNREADABLE]
      : facts.needsJb.map((i) => describeWaitingItem(i)),
  ));

  blocks.push(renderBlock(
    'WAITING ON JB — approvals sent to this chat with no answer yet:',
    reads.approvals && reads.approvals.ok === false
      ? [UNREADABLE]
      : facts.approvals.map((i) => describeWaitingItem(i)),
  ));

  blocks.push(renderBlock(
    'FLEET HEALTH — agents not reporting healthy:',
    reads.fleet && reads.fleet.ok === false
      ? [UNREADABLE]
      : facts.fleet.map((f) => `${f.name}: ${f.word}`),
  ));

  blocks.push(renderBlock(
    'LAST CLOSE-OUT — the newest note an agent left:',
    reads.closeOut && reads.closeOut.ok === false
      ? [UNREADABLE]
      : facts.closeOut
        ? [`${facts.closeOut.what ? `${facts.closeOut.what}: ` : ''}${facts.closeOut.note}`
          + `${facts.closeOut.ageDays != null ? ` (${plainAge(facts.closeOut.ageDays)} ago)` : ''}`]
        : [],
  ));

  blocks.push(renderBlock(
    'OUTREACH PIPELINE:',
    reads.pipeline && reads.pipeline.ok === false
      ? [UNREADABLE]
      : facts.pipeline ? [facts.pipeline] : [],
  ));

  const text = blocks.join('\n\n');
  return text.length > CONTEXT_CHAR_CAP
    ? `${text.slice(0, CONTEXT_CHAR_CAP - 20)}\n…(trimmed)`
    : text;
}

/** Does JB's message ask what is waiting on him? */
export function asksWhatNeedsJb(text) {
  if (!text) return false;
  return /\b(what|anything|which|who|is there anything)\b[^?]*\bneed(s|ed)?\s+(me|my|you\b)/i.test(text)
    || /\bneeds?\s+(me|my (input|approval|answer|call|sign[- ]?off))\b/i.test(text)
    || /\bwaiting (on|for) (me|my)\b/i.test(text)
    || /\bwhat('?s| is) (waiting|outstanding|pending) (on|for) me\b/i.test(text)
    || /\bwhat do you need from me\b/i.test(text)
    || /\banything for me (to do|to approve)\b/i.test(text);
}

export const NOTHING_WAITING = 'Nothing is waiting on you right now.';

/** The deterministic answer to "what needs me" — read from the rows, never written by a model. */
export function answerWhatNeedsJb(facts) {
  const items = facts.waiting || [];
  const failed = facts.failed || {};
  // Said even when the other list has items — a half-read list that looks
  // complete is the same lie as an invented one, just quieter.
  const missing = [failed.needsJb && 'the task list', failed.approvals && 'the approvals'].filter(Boolean);
  const caveat = missing.length
    ? `I could not read ${missing.join(' or ')} this time, so this may be incomplete.`
    : null;

  if (!items.length) {
    if (missing.length) {
      return `I don't have that in front of me — ${missing.join(' or ')} did not come back this time. ARCEUS can read it directly.`;
    }
    return caveat ? `${NOTHING_WAITING}\n${caveat}` : NOTHING_WAITING;
  }
  const head = items.length === 1 ? 'One thing needs you.' : `${items.length} things need you.`;
  const lines = [head, ...items.map((i) => describeWaitingItem(i))];
  if (caveat) lines.push(caveat);
  return lines.join('\n').slice(0, 4000);
}
