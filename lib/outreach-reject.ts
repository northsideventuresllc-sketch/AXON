import { rejectOutreachLeadWithClient, getRejectReasonFromNotes } from './outreach-reject.mjs';
import { getClient } from './leads';
import { OPERATOR_ID } from './axon-types';
import type { LeadWithMeta } from './types';

export interface RejectOutreachOptions {
  reason?: string | null;
  operatorId?: string;
  source?: 'portal' | 'telegram' | 'api';
}

export interface RejectOutreachResult {
  lead: LeadWithMeta;
  reason: string | null;
}

export async function rejectOutreachLead(
  id: string,
  options: RejectOutreachOptions = {}
): Promise<RejectOutreachResult | null> {
  const { sbSelect, sbInsert, sbPatch } = getClient();
  return rejectOutreachLeadWithClient(
    { sbSelect, sbInsert, sbPatch },
    id,
    {
      reason: options.reason,
      operatorId: options.operatorId || OPERATOR_ID,
      source: options.source || 'api',
    }
  ) as Promise<RejectOutreachResult | null>;
}

export function getRejectReasonFromMeta(notes: string | null): string | null {
  return getRejectReasonFromNotes(notes);
}
