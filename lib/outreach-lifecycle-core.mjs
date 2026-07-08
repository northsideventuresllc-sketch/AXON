import { SOURCE, formatNotes, parseNotes } from './constants.mjs';

export const REJECT_TO_ARCHIVE_MS = 72 * 60 * 60 * 1000;
export const ARCHIVE_TO_PURGE_MS = 7 * 24 * 60 * 60 * 1000;

function rejectedAt(meta) {
  const ts = meta.rejected_at || meta.auto_rejected_at;
  return ts ? new Date(ts).getTime() : null;
}

/**
 * Move rejected leads through archive → purge lifecycle.
 * @param {{ sbSelect: Function, sbPatch: Function }} sb
 */
export async function sweepOutreachLeadLifecycle(sb, { now = Date.now() } = {}) {
  const { sbSelect, sbPatch } = sb;
  const rows = await sbSelect(
    'ni_brain_outreach',
    `source=eq.${SOURCE}&status=in.(dead,archived)&select=id,status,notes,handle&limit=500`
  );

  let archived = 0;
  let purged = 0;

  for (const row of rows || []) {
    const meta = parseNotes(row.notes);
    const rejectedTs = rejectedAt(meta);
    if (!rejectedTs) continue;

    if (row.status === 'dead' && now - rejectedTs >= REJECT_TO_ARCHIVE_MS) {
      const nextMeta = {
        ...meta,
        archived_at: new Date(now).toISOString(),
        archived_from: 'dead',
      };
      await sbPatch('ni_brain_outreach', `id=eq.${row.id}`, {
        status: 'archived',
        notes: formatNotes(nextMeta),
      });
      archived += 1;
      continue;
    }

    const archivedTs = meta.archived_at ? new Date(meta.archived_at).getTime() : null;
    if (row.status === 'archived' && archivedTs && now - archivedTs >= ARCHIVE_TO_PURGE_MS) {
      const nextMeta = {
        ...meta,
        purged_at: new Date(now).toISOString(),
        handle_blocked: true,
        blocked_handle: (row.handle || '').toLowerCase(),
      };
      await sbPatch('ni_brain_outreach', `id=eq.${row.id}`, {
        status: 'purged',
        notes: formatNotes(nextMeta),
      });
      purged += 1;
    }
  }

  return { archived, purged };
}

export function isVisibleLeadStatus(status) {
  return status !== 'purged';
}
