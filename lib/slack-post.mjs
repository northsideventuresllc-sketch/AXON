/**
 * Shared Slack #agent-ops helper — "Agent Comms — Talk, Slack, Fire" (locked
 * doc, 2026-09-02): every post to #agent-ops (channel C0BQMTYMNRH) must START
 * with a bold header line `*<canonical agent_name> — <one line what happened>*`.
 *
 * Standardises on the Supabase edge function `slack-post` — the same
 * mechanism/auth the AXON Executive Agent already uses — instead of the raw
 * Slack `chat.postMessage` REST call some scripts called directly.
 */
import { SUPABASE_URL } from './constants.mjs';

export const SLACK_CHANNEL_ID = 'C0BQMTYMNRH';
const SLACK_POST_URL = `${SUPABASE_URL}/functions/v1/slack-post`;
// Same publishable/anon key every other NVG agent uses to call slack-post — not a
// secret, it is the project's public REST anon key (Supabase RLS gates the writes).
const SLACK_ANON_KEY = 'sb_publishable_-JPXXSn9eyX9BxdvIzTulw_QkHPIERR';

/** Builds the required bold header line: `*<agent_name> — <headline>*`. */
export function buildAgentOpsHeader(agentName, headline) {
  return `*${agentName} — ${headline}*`;
}

/**
 * Post a standard-format message to #agent-ops.
 * `agentName` — canonical agent name (see lib/agent-names.mjs).
 * `headline` — one line, what happened.
 * `body` — optional extra detail appended below the header.
 */
export async function postAgentOps({ agentName, headline, body = '' }) {
  const header = buildAgentOpsHeader(agentName, headline);
  const text = body ? `${header}\n${body}` : header;
  try {
    const res = await fetch(SLACK_POST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: SLACK_CHANNEL_ID, text }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
