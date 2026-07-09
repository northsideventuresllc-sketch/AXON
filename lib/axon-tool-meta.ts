import type { AxonUserTool } from './axon-user-tools';

export interface AxonToolMeta {
  /** Plain-English setup summary for operators. */
  setupDescription: string;
  /** Seed prompt for the adjust / builder chat. */
  builderPrompt: string;
}

export const AXON_TOOL_META: Record<string, AxonToolMeta> = {
  'manager-dispatch': {
    setupDescription:
      'Shows your Hermes repo-manager queue from NI-Brain. You can fire all queued tasks to GitHub Actions, chat with AXON about each task, and review completed dispatches back to June 29.',
    builderPrompt:
      'Help JB adjust Repo Manager Agent Dispatch — filters, completed history window, venture labels, and dispatch fire behavior.',
  },
  'match-fit-admin': {
    setupDescription:
      'Match Fit admin portal gated by your access code. Content calendar, outreach leads, and ad tracking pull live from NI-Brain once signed in.',
    builderPrompt:
      'Help JB adjust AXON Management-Match Fit — tabs, stats, deep links, and Match Fit data views.',
  },
  'ni-outreach': {
    setupDescription:
      'Your NI Services outreach pipeline: approval queue, lead pipeline, channel settings (email + social), ICP checklist, and follow-up drafts for sent leads.',
    builderPrompt:
      'Help JB adjust NI Outreach HQ — queue flow, channel connections, follow-up engine, and pipeline bulk actions.',
  },
  'hermes-sync': {
    setupDescription:
      'Marketing task mirror from the dispatch queue — read-only status of Hermes marketing rows. Fire workflows from Repo Manager Agent Dispatch.',
    builderPrompt:
      'Help JB adjust NI Marketing HQ — task grouping, status labels, and links to dispatch.',
  },
  'deal-tracker': {
    setupDescription:
      'Tracks won and negotiating deals from your outreach pipeline — closed-won and sent leads with deal value context.',
    builderPrompt: 'Help JB adjust Financial Tracker — deal stages, stats cards, and lead drill-down.',
  },
};

export function getAxonToolMeta(tool: AxonUserTool): AxonToolMeta {
  return (
    AXON_TOOL_META[tool.slug] ?? {
      setupDescription: `${tool.defaultDisplayName} is connected to your AXON workspace. Open the builder to customize behavior.`,
      builderPrompt: `Help JB adjust the AXON tool "${tool.defaultDisplayName}".`,
    }
  );
}
