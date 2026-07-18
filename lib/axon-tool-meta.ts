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
  lucielle: {
    setupDescription:
      'Financial command center across NVG → NI / NFI / NCC → sectors / NSSS. Revenue, gross profit, net profit, cashflow and cash-available roll up by venture. Bank, Stripe, P2P and credit-score connectors are placeholders until you link them.',
    builderPrompt:
      'Help JB adjust Lucielle — NVG vs Personal modes, venture hierarchy, metric cards, recommendations, and connector setup.',
  },
  'usage-tower': {
    setupDescription:
      'Live-style view of AI + platform spend by day / week / month / year across every connector (Anthropic, OpenAI, Gemini, Cursor, Harness, GitHub, Supabase, Vercel, Resend, SerpAPI, Buffer, Higgsfield, HeyGen, local models). Attributes spend by venture, flags Unknown, and lets you set custom caps.',
    builderPrompt:
      'Help JB adjust Usage Tower — connector registry, venture attribution, spend windows, caps, and the efficiency chatbot.',
  },
  'content-machine': {
    setupDescription:
      'NORTHSiDE Intelligence content pipeline — product-first 3/2/2, one post per platform per day across LinkedIn, Instagram, Facebook and Threads (Reddit is handled separately). Approve, edit, adjust and optimize drafts here. Publishing and scheduling stay blocked while the FIRE gate is on HOLD.',
    builderPrompt:
      'Help JB adjust NI Content Machine — the 3/2/2 mix, platform cadence, approval flow, and publish gating.',
  },
  reddit: {
    setupDescription:
      'Two Reddit queues for u/Own-Basil8147 — promotional posts and thread replies. Each item shows its Telegram approval status. Nothing posts automatically; items wait for your approval and the FIRE gate.',
    builderPrompt:
      'Help JB adjust Reddit Queues — subreddit targets, promo vs reply cadence, and Telegram approval routing.',
  },
  'fire-hold': {
    setupDescription:
      'The master safety rail. Shows whether AXON is on HOLD (default) or FIRE, exactly what is blocked while on HOLD, and lets JB flip to FIRE when ready to go live. All sends, publishes, dispatches and cron enables respect this gate.',
    builderPrompt:
      'Help JB adjust Fire / Hold Control — what the gate covers and how firing works.',
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
