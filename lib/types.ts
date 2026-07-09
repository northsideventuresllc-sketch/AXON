export type LeadStatus =
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'dead'
  | 'archived'
  | 'purged'
  | 'closed_won'
  | 'Lead'
  | string;

export type LeadChannel = 'email' | 'linkedin';

export interface LeadMeta {
  channel?: LeadChannel;
  score?: number;
  recommended_service?: string;
  email_subject?: string | null;
  contact_email?: string | null;
  source_link?: string;
  serp_title?: string;
  rejected_reason?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejected_via?: string | null;
  auto_rejected_reason?: string | null;
  auto_rejected?: string | null;
  auto_rejected_at?: string | null;
  archived_at?: string | null;
  archived_from?: string | null;
  purged_at?: string | null;
  handle_blocked?: boolean;
  blocked_handle?: string | null;
  sent_from_email?: string | null;
  sent_reply_to?: string | null;
  sent_from_account?: string | null;
  sent_from_handle?: string | null;
  sent_at?: string | null;
  icp_scan?: { icp_fit?: boolean; segment?: string; industry?: string } | null;
  follow_up_draft?: string | null;
  follow_up_drafted_at?: string | null;
  follow_up_sent_at?: string | null;
  raw?: string;
}

export interface Lead {
  id: string;
  handle: string;
  niche: string | null;
  target_group: string | null;
  why_match_fit: string | null;
  dm_draft: string | null;
  comment_draft: string | null;
  status: LeadStatus;
  notes: string | null;
  added: string | null;
  source: string | null;
  dm_sent: boolean | null;
  followed: boolean | null;
  commented: boolean | null;
  created_at: string;
}

export interface LeadWithMeta extends Lead {
  meta: LeadMeta;
  shortId: string;
}

export interface PipelineStats {
  total: number;
  pending: number;
  approved: number;
  sent: number;
  dead: number;
  closedWon: number;
  goalTarget: number;
  draftsToday: number;
  draftsCap: number;
  counts: Record<string, number>;
}

export const GOAL_TARGET = 4;

export const STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  sent: 'Sent',
  dead: 'Rejected',
  archived: 'Archived',
  purged: 'Purged',
  closed_won: 'Closed Won',
  Lead: 'Lead',
};

export const STATUS_ORDER = [
  'pending_approval',
  'approved',
  'sent',
  'closed_won',
  'dead',
  'archived',
] as const;

export const BULK_STATUS_OPTIONS = [
  'pending_approval',
  'approved',
  'sent',
  'dead',
  'archived',
  'closed_won',
] as const;
