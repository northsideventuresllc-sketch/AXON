import {
  buildOperatorAvoidPatterns,
  buildTrainingPromptBlock,
  fetchOutreachTrainingSignals,
  getOutreachIcpChecklistMeta,
  leadHadDraftEdits,
  loadOutreachTrainingPrompt,
  logOutreachApproveSignal,
  logOutreachAutoRejectSignal,
  logOutreachSendSignal,
  summarizeOutreachTraining,
  summarizeIcpDropStages,
} from './outreach-learn-core.mjs';
import { getClient } from './leads';
import { upsertSignal } from './axon-profile';
import { OPERATOR_ID } from './axon-types';

export interface OutreachRejectReasonCount {
  reason: string;
  count: number;
}

export interface OutreachTrainingSummary {
  signalCount: number;
  topRejectReasons: OutreachRejectReasonCount[];
  editFieldCounts: Record<string, number>;
  approvals: { unchanged: number; edited: number; total: number };
  icpDropCount: number;
  icpDropStages: Record<string, number>;
  active: boolean;
}

export interface OutreachIcpChecklistMeta {
  minScore: number;
  todayQueries: Array<{ query: string; industry: string; searchQuery: string; segment?: string }>;
}

export interface OutreachTrainingPayload {
  summary: OutreachTrainingSummary;
  promptBlock: string;
  operatorAvoidPatterns: string[];
}

export { getOutreachIcpChecklistMeta };

export async function getOutreachTrainingSummary(
  options: { limit?: number; days?: number } = {}
): Promise<OutreachTrainingSummary> {
  const { sbSelect } = getClient();
  const signals = await fetchOutreachTrainingSignals(sbSelect, options);
  return summarizeOutreachTraining(signals) as OutreachTrainingSummary;
}

export async function getOutreachTrainingPayload(
  options: { limit?: number; days?: number } = {}
): Promise<OutreachTrainingPayload> {
  const { sbSelect, sbInsert } = getClient();
  return loadOutreachTrainingPrompt({ sbSelect, sbInsert }, options) as Promise<OutreachTrainingPayload>;
}

export async function recordOutreachApproval(
  leadId: string,
  options: { operatorId?: string } = {}
): Promise<void> {
  const { sbSelect, sbInsert } = getClient();
  const edited = await leadHadDraftEdits(sbSelect, leadId);
  await logOutreachApproveSignal(sbInsert, leadId, {
    operatorId: options.operatorId || OPERATOR_ID,
    edited,
  });
}

export async function recordOutreachSend(
  leadId: string,
  options: {
    channel?: 'email' | 'linkedin';
    payload: Record<string, unknown>;
    operatorId?: string;
  }
): Promise<void> {
  const { sbInsert } = getClient();
  const operatorId = options.operatorId || OPERATOR_ID;
  const field = options.channel === 'linkedin' ? 'sent_dm' : 'sent_email';
  await sbInsert('axon_tool_edit_signals', {
    tool_slug: 'ni-outreach',
    resource_type: 'outreach',
    resource_id: leadId,
    field_name: field,
    before_value: null,
    after_value: JSON.stringify(options.payload),
    operator_id: operatorId,
  });

  try {
    const body =
      options.channel === 'linkedin'
        ? String(options.payload.message || '')
        : String(options.payload.body || '');
    const opener = body.split(/\n/)[0]?.slice(0, 120) || '';
    if (opener) {
      await upsertSignal({
        operator_id: operatorId,
        signal_type: 'phrasing',
        signal_key: `outreach_opener_${options.channel || 'email'}`,
        signal_value: opener,
        weight_delta: 0.4,
      });
    }
    const signOff = body.split(/\n/).slice(-2).join(' ').slice(0, 120);
    if (signOff && signOff !== opener) {
      await upsertSignal({
        operator_id: operatorId,
        signal_type: 'tone',
        signal_key: `outreach_signoff_${options.channel || 'email'}`,
        signal_value: signOff,
        weight_delta: 0.3,
      });
    }
  } catch {
    /* communication signals are best-effort */
  }
}

export {
  buildTrainingPromptBlock,
  fetchOutreachTrainingSignals,
  leadHadDraftEdits,
  loadOutreachTrainingPrompt,
  logOutreachApproveSignal,
  logOutreachAutoRejectSignal,
  logOutreachSendSignal,
  buildOperatorAvoidPatterns,
  summarizeOutreachTraining,
  summarizeIcpDropStages,
};
