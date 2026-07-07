import { SOURCE, formatNotes, parseNotes, shortId } from './constants.mjs';

function enrichLead(lead) {
  return {
    ...lead,
    meta: parseNotes(lead.notes),
    shortId: shortId(lead.id),
  };
}

async function logRejectSignal(sbInsert, resourceId, beforeStatus, reason, operatorId) {
  await sbInsert('axon_tool_edit_signals', {
    tool_slug: 'ni-outreach',
    resource_type: 'outreach',
    resource_id: resourceId,
    field_name: 'reject_reason',
    before_value: beforeStatus,
    after_value: reason?.trim() || null,
    operator_id: operatorId,
  });
}

/**
 * Reject an outreach lead, persist reason in notes, log learn signal.
 * @param {{ sbSelect: Function, sbPatch: Function, sbInsert: Function }} sb
 */
export async function rejectOutreachLeadWithClient(sb, id, options = {}) {
  const { sbSelect, sbPatch, sbInsert } = sb;
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&id=eq.${id}&select=*&limit=1`
  );
  const raw = rows?.[0];
  if (!raw) return null;

  const lead = enrichLead(raw);
  const operatorId = options.operatorId || 'default';
  const reason = options.reason?.trim() || null;
  const source = options.source || 'api';
  const meta = {
    ...lead.meta,
    rejected_reason: reason,
    rejected_at: new Date().toISOString(),
    rejected_by: operatorId,
    rejected_via: source,
  };

  await sbPatch('ni_brain_outreach', `id=eq.${id}`, {
    status: 'dead',
    notes: formatNotes(meta),
  });

  await logRejectSignal(sbInsert, id, lead.status, reason, operatorId);

  const updatedRows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&id=eq.${id}&select=*&limit=1`
  );
  const updated = updatedRows?.[0];
  return updated ? { lead: enrichLead(updated), reason } : null;
}

export function getRejectReasonFromNotes(notes) {
  const meta = parseNotes(notes);
  const reason = meta.rejected_reason ?? meta.auto_rejected_reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}
