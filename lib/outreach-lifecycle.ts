import { getClient } from './leads';
import { isVisibleLeadStatus, sweepOutreachLeadLifecycle } from './outreach-lifecycle-core.mjs';

export { REJECT_TO_ARCHIVE_MS, ARCHIVE_TO_PURGE_MS, isVisibleLeadStatus } from './outreach-lifecycle-core.mjs';

export async function sweepLeadLifecycle() {
  const client = getClient();
  return sweepOutreachLeadLifecycle(client);
}

export function filterVisibleLeads<T extends { status: string }>(leads: T[]): T[] {
  return leads.filter((l) => isVisibleLeadStatus(l.status));
}
