/**
 * Match Fit Outreach HQ v2 → AXON — outreach-event payload validation + Telegram formatting.
 *
 * Shared between the route handler (app/api/axon/match-fit/outreach-event/route.ts),
 * the Telegram callback dispatch (lib/telegram-handler.mjs), and the plain-node test
 * (tests/match-fit-outreach-event.test.mjs).
 *
 * Inbound contract (fixed, mirrors matchfit/src/lib/outreach-axon-notify.ts):
 *   { eventType, leads: [{ platform, leadId, handle?, contact?, summary? }], meta? }
 *   eventType ∈ "new_leads" | "follow_up_due" | "pending_response"
 *
 * The three inline-keyboard actions (Approve / Delete / Rewrite) round-trip back into
 * this app via callback_data of the form `mf:<action>:<platformAbbr>:<leadId>`, kept
 * under Telegram's 64-byte callback_data limit (see PLATFORM_ABBR).
 */

export const OUTREACH_EVENT_TYPES = new Set([
  'new_leads',
  'follow_up_due',
  'pending_response',
]);

export const OUTREACH_PLATFORMS = new Set(['instagram', 'facebook', 'email']);

/** Short codes keep callback_data well under Telegram's 64-byte limit. */
export const PLATFORM_ABBR = { instagram: 'ig', facebook: 'fb', email: 'em' };
const ABBR_TO_PLATFORM = { ig: 'instagram', fb: 'facebook', em: 'email' };

const ACTION_CODES = new Set(['ap', 'dl', 'rw']); // approve, delete, rewrite

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Optional string field — allowed to be absent/null, but if present must be a string. */
function optionalString(v) {
  if (v == null) return { ok: true, value: undefined };
  if (typeof v !== 'string') return { ok: false };
  const trimmed = v.trim();
  return { ok: true, value: trimmed.length ? trimmed : undefined };
}

/**
 * Validate the Match Fit outreach-event payload.
 * Returns { ok: true, data } on success, or { ok: false, error } on the first problem —
 * the route maps this straight to a 400. Only platform + leadId are required per lead;
 * handle/contact/summary are optional (the sender fills them when available).
 */
export function validateOutreachEventPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const { eventType, leads, meta } = body;

  if (!isNonEmptyString(eventType) || !OUTREACH_EVENT_TYPES.has(eventType)) {
    return {
      ok: false,
      error: '"eventType" must be one of new_leads, follow_up_due, pending_response',
    };
  }

  if (!Array.isArray(leads) || leads.length === 0) {
    return { ok: false, error: '"leads" is required and must be a non-empty array' };
  }

  if (meta != null && (typeof meta !== 'object' || Array.isArray(meta))) {
    return { ok: false, error: '"meta" must be an object when present' };
  }

  const normalizedLeads = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (!lead || typeof lead !== 'object' || Array.isArray(lead)) {
      return { ok: false, error: `leads[${i}] must be an object` };
    }

    const { platform, leadId } = lead;
    if (!isNonEmptyString(platform) || !OUTREACH_PLATFORMS.has(platform)) {
      return {
        ok: false,
        error: `leads[${i}].platform must be one of instagram, facebook, email`,
      };
    }
    if (!isNonEmptyString(leadId)) {
      return { ok: false, error: `leads[${i}].leadId is required and must be a non-empty string` };
    }

    const handle = optionalString(lead.handle);
    if (!handle.ok) return { ok: false, error: `leads[${i}].handle must be a string when present` };
    const contact = optionalString(lead.contact);
    if (!contact.ok) return { ok: false, error: `leads[${i}].contact must be a string when present` };
    const summary = optionalString(lead.summary);
    if (!summary.ok) return { ok: false, error: `leads[${i}].summary must be a string when present` };

    normalizedLeads.push({
      platform: platform.trim(),
      leadId: leadId.trim(),
      handle: handle.value,
      contact: contact.value,
      summary: summary.value,
    });
  }

  return {
    ok: true,
    data: {
      eventType,
      leads: normalizedLeads,
      meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : undefined,
    },
  };
}

function isProfileUrl(contact) {
  if (!contact) return false;
  try {
    const u = new URL(contact);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Human label for a lead — @handle, else contact, else short leadId. */
function leadLabel(lead) {
  if (lead.handle) return lead.handle;
  if (lead.contact) return lead.contact;
  return lead.leadId;
}

/**
 * Format one Telegram message body for a single lead, per event type.
 * Returns a plain string (≤4000 chars) — the keyboard is built separately.
 */
export function buildLeadMessage(eventType, lead, meta = {}) {
  const label = leadLabel(lead);
  const lines = [];

  if (eventType === 'follow_up_due') {
    const stage = meta.followUpStage || lead.summary || 'follow-up';
    lines.push(`⏰ Follow-up due — ${label}`);
    lines.push(`Platform: ${lead.platform}`);
    if (lead.contact) lines.push(lead.contact);
    lines.push(`Stage: ${stage}`);
    lines.push('');
    lines.push('Needs a follow-up decision. Approve to send it, Delete to drop, Rewrite to edit.');
    return lines.join('\n').slice(0, 4000);
  }

  if (eventType === 'pending_response') {
    lines.push(`💬 New reply needs a response — ${label}`);
    lines.push(`Platform: ${lead.platform}`);
    if (lead.contact) lines.push(lead.contact);
    lines.push('');
    lines.push('Drafted response:');
    lines.push(lead.summary || '(no draft in payload — open Outreach HQ to draft)');
    lines.push('');
    lines.push('Approve to send, Rewrite to edit the draft, Delete to skip.');
    return lines.join('\n').slice(0, 4000);
  }

  // new_leads (default)
  lines.push(`🆕 New lead — ${label}`);
  lines.push(`Platform: ${lead.platform}`);

  if (lead.platform === 'instagram') {
    // JB spec: profile link, why-fit summary, DM text, comment text.
    // The payload carries profile link (contact) + a why-fit/context line (summary).
    // DM/comment copy is NOT in the fixed contract — see report; shown when present.
    if (isProfileUrl(lead.contact)) lines.push(`Profile: ${lead.contact}`);
    else if (lead.contact) lines.push(`Contact: ${lead.contact}`);
    lines.push('');
    lines.push('Why they fit:');
    lines.push(lead.summary || '(no summary in payload)');
  } else {
    if (lead.contact) lines.push(lead.contact);
    lines.push('');
    lines.push(lead.summary || '(no summary in payload)');
  }

  lines.push('');
  lines.push('Approve to queue for dispatch, Delete to drop, Rewrite to edit the copy.');
  return lines.join('\n').slice(0, 4000);
}

/** Build the Approve / Delete / Rewrite inline keyboard for a single lead. */
export function buildLeadKeyboard(lead) {
  const abbr = PLATFORM_ABBR[lead.platform] || 'xx';
  const id = lead.leadId;
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `mf:ap:${abbr}:${id}` },
        { text: '🗑 Delete', callback_data: `mf:dl:${abbr}:${id}` },
        { text: '✏️ Rewrite', callback_data: `mf:rw:${abbr}:${id}` },
      ],
    ],
  };
}

/**
 * Parse an `mf:` outreach callback_data string.
 * Returns { action, platform, leadId } or null. leadId may itself contain ':' (rare) —
 * everything after the platform segment is treated as the id.
 */
export function parseOutreachCallback(data) {
  if (typeof data !== 'string' || !data.startsWith('mf:')) return null;
  const parts = data.split(':');
  // parts: ['mf', action, abbr, ...idSegments]
  if (parts.length < 4) return null;
  const [, action, abbr] = parts;
  if (!ACTION_CODES.has(action)) return null;
  const platform = ABBR_TO_PLATFORM[abbr];
  if (!platform) return null;
  const leadId = parts.slice(3).join(':');
  if (!leadId) return null;
  return { action, platform, leadId };
}

/** Map an action code to a human verb (for reply text). */
export function actionVerb(action) {
  return { ap: 'approve', dl: 'delete', rw: 'rewrite' }[action] || action;
}

/**
 * Build the copy-paste rewrite command shown after a Rewrite button tap.
 * leadId keeps its original casing (Match Fit ids are case-sensitive cuids).
 */
export function rewriteCommandTemplate(platform, leadId) {
  const abbr = PLATFORM_ABBR[platform] || 'xx';
  return `/mf_rewrite ${abbr}:${leadId} `;
}

/**
 * Parse a `/mf_rewrite <abbr>:<leadId> <new text>` command from the RAW message text
 * (not parseCommand's lowercased arg — leadIds are case-sensitive).
 * Returns { platform, leadId, text } or null.
 */
export function parseRewriteCommand(rawText) {
  if (typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  const m = /^\/mf_rewrite(?:@\w+)?\s+([a-z]{2}):(\S+)\s+([\s\S]+)$/i.exec(trimmed);
  if (!m) return null;
  const platform = ABBR_TO_PLATFORM[m[1].toLowerCase()];
  if (!platform) return null;
  const leadId = m[2];
  const text = m[3].trim();
  if (!leadId || !text) return null;
  return { platform, leadId, text };
}
