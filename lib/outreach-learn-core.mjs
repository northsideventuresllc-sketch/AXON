import { randomUUID } from 'node:crypto';

const TOOL_SLUG = 'ni-outreach';
const DRAFT_FIELDS = new Set(['email_subject', 'comment_draft', 'dm_draft']);

import { MIN_OUTREACH_SCORE, pickQueriesForDay } from './constants.mjs';

export function getOutreachIcpChecklistMeta() {
  return {
    minScore: MIN_OUTREACH_SCORE,
    todayQueries: pickQueriesForDay(),
  };
}

/**
 * @param {{ sbSelect: Function }} sb
 */
export async function fetchOutreachTrainingSignals(sbSelect, { limit = 80, days = 60 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = await sbSelect(
    'axon_tool_edit_signals',
    `tool_slug=eq.${TOOL_SLUG}&created_at=gte.${since}&select=*&order=created_at.desc&limit=${limit}`
  );
  return rows || [];
}

export function summarizeOutreachTraining(signals) {
  const rejectReasons = [];
  const editFieldCounts = {};
  const approvals = { unchanged: 0, edited: 0, total: 0 };

  for (const signal of signals) {
    const field = signal.field_name;
    const after = typeof signal.after_value === 'string' ? signal.after_value.trim() : '';

    if (field === 'reject_reason' && after) {
      rejectReasons.push(after);
      continue;
    }

    if (field === 'auto_reject' && after) {
      rejectReasons.push(after);
      continue;
    }

    if (field === 'icp_drop' && after) {
      rejectReasons.push(after);
      continue;
    }

    if (DRAFT_FIELDS.has(field)) {
      editFieldCounts[field] = (editFieldCounts[field] || 0) + 1;
      continue;
    }

    if (field === 'approved') {
      approvals.total += 1;
      if (after === 'edited') approvals.edited += 1;
      else approvals.unchanged += 1;
      continue;
    }

    if (field === 'sent_email' || field === 'sent_dm') {
      editFieldCounts[field] = (editFieldCounts[field] || 0) + 1;
    }
  }

  const reasonCounts = new Map();
  for (const reason of rejectReasons) {
    const key = reason.toLowerCase();
    reasonCounts.set(key, (reasonCounts.get(key) || 0) + 1);
  }

  const topRejectReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));

  const icpDropCount = signals.filter((s) => s.field_name === 'icp_drop').length;
  const icpDropStages = summarizeIcpDropStages(signals);

  return {
    signalCount: signals.length,
    topRejectReasons,
    editFieldCounts,
    approvals,
    icpDropCount,
    icpDropStages,
    active: signals.length > 0,
  };
}

export function summarizeIcpDropStages(signals) {
  const stages = {};
  for (const signal of signals) {
    if (signal.field_name !== 'icp_drop') continue;
    const stage = signal.before_value || 'unknown';
    stages[stage] = (stages[stage] || 0) + 1;
  }
  return stages;
}

export function buildTrainingPromptBlock(summary) {
  if (!summary?.active) return '';

  const lines = [
    'Operator training signals (honor these when scoring and drafting):',
  ];

  if (summary.topRejectReasons.length) {
    lines.push('Reject / avoid patterns the operator flagged:');
    for (const { reason, count } of summary.topRejectReasons.slice(0, 6)) {
      lines.push(`- "${reason}" (${count}x)`);
    }
  }

  const bodyEdits =
    (summary.editFieldCounts.comment_draft || 0) + (summary.editFieldCounts.dm_draft || 0);
  if (bodyEdits >= 2) {
    lines.push(
      'Operator often rewrites draft body copy — be tighter, more specific to prospect pain, less generic opener.'
    );
  }

  if ((summary.editFieldCounts.email_subject || 0) >= 2) {
    lines.push(
      'Operator edits subjects — keep them direct and professional; no hype or fake familiarity.'
    );
  }

  if (summary.approvals.total >= 3 && summary.approvals.unchanged > summary.approvals.edited) {
    lines.push('Recent approvals were mostly unchanged — current draft tone and length are working.');
  }

  const sentEmails = summary.editFieldCounts.sent_email || 0;
  const sentDms = summary.editFieldCounts.sent_dm || 0;
  if (sentEmails + sentDms >= 2) {
    lines.push(
      'Operator has sent finalized outreach — mirror the tone, opener style, and sign-off from recent sent messages.'
    );
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

/** Step 8 — operator reject patterns fed back into pre-scan filter. */
export function buildOperatorAvoidPatterns(summary) {
  if (!summary?.topRejectReasons?.length) return [];
  return summary.topRejectReasons
    .slice(0, 6)
    .map(({ reason }) => reason.trim())
    .filter(Boolean);
}

/**
 * @param {{ sbSelect: Function, sbInsert: Function }} sb
 */
export async function loadOutreachTrainingPrompt(sb, options = {}) {
  const signals = await fetchOutreachTrainingSignals(sb.sbSelect, options);
  const summary = summarizeOutreachTraining(signals);
  return {
    summary,
    promptBlock: buildTrainingPromptBlock(summary),
    operatorAvoidPatterns: buildOperatorAvoidPatterns(summary),
  };
}

/**
 * @param {{ sbSelect: Function, sbInsert: Function }} sb
 */
export async function leadHadDraftEdits(sbSelect, leadId) {
  const rows = await sbSelect(
    'axon_tool_edit_signals',
    `tool_slug=eq.${TOOL_SLUG}&resource_id=eq.${leadId}&field_name=in.(email_subject,comment_draft,dm_draft)&select=id&limit=1`
  );
  return (rows?.length || 0) > 0;
}

/**
 * @param {{ sbInsert: Function }} sb
 */
export async function logOutreachApproveSignal(sbInsert, leadId, { operatorId = 'default', edited = false } = {}) {
  await sbInsert('axon_tool_edit_signals', {
    tool_slug: TOOL_SLUG,
    resource_type: 'outreach',
    resource_id: leadId,
    field_name: 'approved',
    before_value: null,
    after_value: edited ? 'edited' : 'unchanged',
    operator_id: operatorId,
  });
}

/**
 * Log final sent content for self-learning tone molding.
 * @param {{ sbInsert: Function }} sb
 */
export async function logOutreachSendSignal(
  sbInsert,
  leadId,
  { channel = 'email', payload, operatorId = 'default' } = {}
) {
  const field = channel === 'linkedin' ? 'sent_dm' : 'sent_email';
  await sbInsert('axon_tool_edit_signals', {
    tool_slug: TOOL_SLUG,
    resource_type: 'outreach',
    resource_id: leadId,
    field_name: field,
    before_value: null,
    after_value: typeof payload === 'string' ? payload : JSON.stringify(payload),
    operator_id: operatorId,
  });
}

/**
 * @param {{ sbInsert: Function }} sb
 */
export async function logOutreachAutoRejectSignal(sbInsert, leadId, reason, operatorId = 'axon-icp') {
  await sbInsert('axon_tool_edit_signals', {
    tool_slug: TOOL_SLUG,
    resource_type: 'outreach',
    resource_id: leadId,
    field_name: 'auto_reject',
    before_value: 'pending_approval',
    after_value: reason,
    operator_id: operatorId,
  });
}

/** Step 7 — log ICP drops before a lead row exists. */
export async function logOutreachIcpDropSignal(
  sbInsert,
  { reason, stage, label, operatorId = 'axon-icp' } = {}
) {
  if (!reason) return;
  await sbInsert('axon_tool_edit_signals', {
    tool_slug: TOOL_SLUG,
    resource_type: 'outreach_prospect',
    resource_id: randomUUID(),
    field_name: 'icp_drop',
    before_value: stage || 'unknown',
    after_value: reason,
    operator_id: operatorId,
  });
  if (label) {
    console.log(`ICP drop (${stage}): ${label} — ${reason}`);
  }
}
