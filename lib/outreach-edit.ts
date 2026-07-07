import { formatNotes } from './constants.mjs';
import { fetchLeadById, getClient, updateLeadStatus } from './leads';
import { OPERATOR_ID } from './axon-types';
import type { LeadWithMeta } from './types';

export interface OutreachDraftPatch {
  email_subject?: string | null;
  comment_draft?: string | null;
  dm_draft?: string | null;
}

interface FieldDiff {
  field_name: string;
  before_value: string | null;
  after_value: string | null;
}

export interface PatchOutreachResult {
  lead: LeadWithMeta;
  changed: boolean;
  fields: string[];
}

async function logEditSignals(
  resourceId: string,
  diffs: FieldDiff[],
  operatorId: string
): Promise<void> {
  if (diffs.length === 0) return;
  const { sbInsert } = getClient();
  await Promise.all(
    diffs.map((diff) =>
      sbInsert('axon_tool_edit_signals', {
        tool_slug: 'ni-outreach',
        resource_type: 'outreach',
        resource_id: resourceId,
        field_name: diff.field_name,
        before_value: diff.before_value,
        after_value: diff.after_value,
        operator_id: operatorId,
      })
    )
  );
}

export async function patchOutreachDraft(
  id: string,
  patch: OutreachDraftPatch,
  operatorId = OPERATOR_ID
): Promise<PatchOutreachResult | null> {
  const lead = await fetchLeadById(id);
  if (!lead) return null;

  const meta = { ...lead.meta };
  const rowPatch: Record<string, string | null> = {};
  const diffs: FieldDiff[] = [];

  if (patch.email_subject !== undefined) {
    const before = meta.email_subject ?? null;
    const after = patch.email_subject;
    if (before !== after) {
      diffs.push({ field_name: 'email_subject', before_value: before, after_value: after });
      meta.email_subject = after;
    }
  }

  if (patch.comment_draft !== undefined) {
    const before = lead.comment_draft ?? null;
    const after = patch.comment_draft;
    if (before !== after) {
      diffs.push({ field_name: 'comment_draft', before_value: before, after_value: after });
      rowPatch.comment_draft = after;
    }
  }

  if (patch.dm_draft !== undefined) {
    const before = lead.dm_draft ?? null;
    const after = patch.dm_draft;
    if (before !== after) {
      diffs.push({ field_name: 'dm_draft', before_value: before, after_value: after });
      rowPatch.dm_draft = after;
    }
  }

  if (diffs.length === 0) {
    return { lead, changed: false, fields: [] };
  }

  if (patch.email_subject !== undefined) {
    rowPatch.notes = formatNotes(meta);
  }

  await updateLeadStatus(id, rowPatch);
  await logEditSignals(id, diffs, operatorId);

  const updated = await fetchLeadById(id);
  if (!updated) return null;

  return {
    lead: updated,
    changed: true,
    fields: diffs.map((d) => d.field_name),
  };
}
