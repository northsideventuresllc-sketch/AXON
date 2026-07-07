import {
  buildOperatorAvoidPatterns,
  buildTrainingPromptBlock,
  fetchOutreachTrainingSignals,
  getOutreachIcpChecklistMeta,
  leadHadDraftEdits,
  loadOutreachTrainingPrompt,
  logOutreachApproveSignal,
  logOutreachAutoRejectSignal,
  summarizeOutreachTraining,
  summarizeIcpDropStages,
} from './outreach-learn.mjs';
import { getClient } from './leads';
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

export {
  buildTrainingPromptBlock,
  fetchOutreachTrainingSignals,
  leadHadDraftEdits,
  loadOutreachTrainingPrompt,
  logOutreachApproveSignal,
  logOutreachAutoRejectSignal,
  buildOperatorAvoidPatterns,
  summarizeOutreachTraining,
  summarizeIcpDropStages,
};
