import { createSupabaseClient } from './supabase.mjs';
import {
  MAX_DRAFTS_PER_DAY,
  SOURCE,
  parseNotes,
  formatNotes,
  shortId,
  todayUtc,
} from './constants.mjs';
import { filterVisibleLeads, sweepLeadLifecycle } from './outreach-lifecycle';
import type { Lead, LeadWithMeta, PipelineStats } from './types';
import { GOAL_TARGET } from './types';

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function getClient() {
  return createSupabaseClient(getSupabaseKey());
}

export function enrichLead(lead: Lead): LeadWithMeta {
  return {
    ...lead,
    meta: parseNotes(lead.notes),
    shortId: shortId(lead.id),
  };
}

export async function fetchLeads(limit = 200): Promise<LeadWithMeta[]> {
  try {
    await sweepLeadLifecycle();
  } catch {
    /* lifecycle sweep is best-effort */
  }
  const { sbSelect } = getClient();
  const rows = (await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&status=neq.purged&select=*&order=created_at.desc&limit=${limit}`
  )) as Lead[];
  return filterVisibleLeads((rows || []).map(enrichLead));
}

export async function fetchLeadById(id: string): Promise<LeadWithMeta | null> {
  const { sbSelect } = getClient();
  const rows = (await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&id=eq.${id}&select=*&limit=1`
  )) as Lead[];
  const lead = rows?.[0];
  return lead ? enrichLead(lead) : null;
}

export async function findLeadByShortId(sid: string): Promise<LeadWithMeta | null> {
  const leads = await fetchLeads(100);
  return leads.find((l) => l.shortId === sid || l.id === sid) ?? null;
}

export async function fetchPipelineStats(): Promise<PipelineStats> {
  const { sbSelect } = getClient();
  const today = todayUtc();

  const [statusRows, todayRows] = await Promise.all([
    sbSelect('ni_brain_outreach', `source=eq.${SOURCE}&select=status&limit=500`) as Promise<
      { status?: string }[]
    >,
    sbSelect(
      'ni_brain_outreach',
      `source=eq.${SOURCE}&created_at=gte.${today}T00:00:00Z&select=id`
    ) as Promise<{ id: string }[]>,
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusRows || []) {
    const s = row.status || 'unknown';
    counts[s] = (counts[s] || 0) + 1;
  }

  return {
    total: statusRows?.length || 0,
    pending: counts.pending_approval || 0,
    approved: counts.approved || 0,
    sent: counts.sent || 0,
    dead: counts.dead || 0,
    closedWon: counts.closed_won || 0,
    goalTarget: GOAL_TARGET,
    draftsToday: todayRows?.length || 0,
    draftsCap: MAX_DRAFTS_PER_DAY,
    counts,
  };
}

export async function updateLeadStatus(id: string, patch: Partial<Lead>) {
  const { sbPatch } = getClient();
  return sbPatch('ni_brain_outreach', `id=eq.${id}`, patch);
}

export async function updateLeadNotes(id: string, meta: Record<string, unknown>) {
  return updateLeadStatus(id, { notes: formatNotes(meta) });
}

export async function bulkUpdateLeads(
  ids: string[],
  patch: Partial<Lead> & { metaPatch?: Record<string, unknown> }
) {
  const { sbSelect, sbPatch } = getClient();
  const { metaPatch, ...leadPatch } = patch;
  const results: string[] = [];

  for (const id of ids) {
    if (metaPatch) {
      const rows = (await sbSelect(
        'ni_brain_outreach',
        `source=eq.${SOURCE}&id=eq.${id}&select=notes&limit=1`
      )) as { notes: string | null }[];
      const meta = { ...parseNotes(rows?.[0]?.notes), ...metaPatch };
      await sbPatch('ni_brain_outreach', `id=eq.${id}`, {
        ...leadPatch,
        notes: formatNotes(meta),
      });
    } else {
      await sbPatch('ni_brain_outreach', `id=eq.${id}`, leadPatch);
    }
    results.push(id);
  }

  return results;
}

export async function addWaitlistEmail(email: string) {
  const { sbInsert } = getClient();
  const today = todayUtc();
  return sbInsert('arm3_weekly_logs', {
    week_of: today,
    log_type: 'axon_waitlist',
    summary: `Waitlist signup: ${email}`,
    detail: { email, signed_up_at: new Date().toISOString() },
    action_required: false,
  });
}
