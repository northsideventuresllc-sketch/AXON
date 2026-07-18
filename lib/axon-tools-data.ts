/**
 * Fixture + registry data for the weekend tool build (Lucielle, Usage Tower,
 * Reddit Queues). Pure data — safe to import from client components. Real
 * connectors replace these feeds once linked; the shapes are the contract.
 */

/* ------------------------------------------------------------------ *
 * Lucielle — financial command center
 * ------------------------------------------------------------------ */

export type LucielleMode = 'nvg' | 'personal';

export interface LucielleNode {
  id: string;
  label: string;
  kind: 'group' | 'company' | 'sector' | 'account';
  children?: LucielleNode[];
}

/** NVG → NI / NFI / NCC → sectors / NSSS hierarchy. */
export const LUCIELLE_HIERARCHY: LucielleNode = {
  id: 'nvg',
  label: 'NORTHSiDE Ventures Group (NVG)',
  kind: 'group',
  children: [
    {
      id: 'ni',
      label: 'NORTHSiDE Intelligence (NI)',
      kind: 'company',
      children: [
        { id: 'ni-services', label: 'NI Services', kind: 'sector' },
        { id: 'ni-products', label: 'NI Products', kind: 'sector' },
        { id: 'nsss', label: 'NSSS', kind: 'sector' },
      ],
    },
    {
      id: 'nfi',
      label: 'NORTHSiDE Financial (NFI)',
      kind: 'company',
      children: [
        { id: 'nfi-capital', label: 'Capital', kind: 'sector' },
        { id: 'nfi-p2p', label: 'P2P Lending', kind: 'sector' },
      ],
    },
    {
      id: 'ncc',
      label: 'NORTHSiDE Creative Co (NCC)',
      kind: 'company',
      children: [
        { id: 'ncc-media', label: 'Media', kind: 'sector' },
        { id: 'ncc-brand', label: 'Brand Studio', kind: 'sector' },
      ],
    },
  ],
};

export interface LucielleMetric {
  key: string;
  label: string;
  value: number;
  deltaPct: number;
  format: 'currency' | 'percent';
}

export interface LucielleView {
  nodeId: string;
  metrics: LucielleMetric[];
  recommendations: { id: string; severity: 'info' | 'watch' | 'action'; text: string }[];
}

export const LUCIELLE_VIEWS: Record<string, LucielleView> = {
  nvg: {
    nodeId: 'nvg',
    metrics: [
      { key: 'revenue', label: 'Revenue (MTD)', value: 48250, deltaPct: 12.4, format: 'currency' },
      { key: 'gp', label: 'Gross Profit', value: 33100, deltaPct: 9.1, format: 'currency' },
      { key: 'np', label: 'Net Profit', value: 14820, deltaPct: 6.7, format: 'currency' },
      { key: 'cashflow', label: 'Cashflow (30d)', value: 9640, deltaPct: -3.2, format: 'currency' },
      { key: 'cash', label: 'Cash Available', value: 61230, deltaPct: 4.5, format: 'currency' },
    ],
    recommendations: [
      { id: 'r1', severity: 'action', text: 'NI Services GP margin up 9% — reinvest into outreach capacity once FIRE is live.' },
      { id: 'r2', severity: 'watch', text: 'Cashflow dipped 3.2% on quarterly tooling renewals — smooth with monthly billing.' },
      { id: 'r3', severity: 'info', text: 'NFI P2P principal returns land in 6 days; expect a cash-available bump.' },
    ],
  },
  personal: {
    nodeId: 'personal',
    metrics: [
      { key: 'revenue', label: 'Income (MTD)', value: 8200, deltaPct: 2.1, format: 'currency' },
      { key: 'gp', label: 'After Tax', value: 5740, deltaPct: 1.8, format: 'currency' },
      { key: 'np', label: 'Savings Rate', value: 31, deltaPct: 3.4, format: 'percent' },
      { key: 'cashflow', label: 'Cashflow (30d)', value: 2100, deltaPct: 5.0, format: 'currency' },
      { key: 'cash', label: 'Cash Available', value: 18400, deltaPct: 1.2, format: 'currency' },
    ],
    recommendations: [
      { id: 'p1', severity: 'info', text: 'Savings rate 31% — above your 25% target for the third month.' },
      { id: 'p2', severity: 'watch', text: 'Discretionary spend trending up; review before month end.' },
    ],
  },
};

export interface LucielleConnector {
  id: string;
  label: string;
  category: 'banking' | 'payments' | 'lending' | 'credit';
  status: 'placeholder' | 'connected';
  note: string;
}

export const LUCIELLE_CONNECTORS: LucielleConnector[] = [
  { id: 'banks', label: 'Bank accounts', category: 'banking', status: 'placeholder', note: 'Plaid / direct feed — link to pull balances + cashflow.' },
  { id: 'stripe', label: 'Stripe', category: 'payments', status: 'placeholder', note: 'Live revenue + payout data for NI.' },
  { id: 'p2p', label: 'P2P lending', category: 'lending', status: 'placeholder', note: 'NFI principal + interest schedule.' },
  { id: 'fico', label: 'FICO score', category: 'credit', status: 'placeholder', note: 'Credit-score placeholder — read-only.' },
  { id: 'vantage', label: 'VantageScore', category: 'credit', status: 'placeholder', note: 'Credit-score placeholder — read-only.' },
];

/* ------------------------------------------------------------------ *
 * Usage Tower — spend + connector registry
 * ------------------------------------------------------------------ */

export interface UsageConnector {
  id: string;
  label: string;
  category: 'ai' | 'infra' | 'comms' | 'creative' | 'data' | 'local';
  spendDay: number;
  spendWeek: number;
  spendMonth: number;
  spendYear: number;
  venture: string;
  capMonthly: number | null;
}

export const USAGE_CONNECTORS: UsageConnector[] = [
  { id: 'anthropic', label: 'Anthropic', category: 'ai', spendDay: 42.1, spendWeek: 268.4, spendMonth: 1042.8, spendYear: 9880.2, venture: 'NI', capMonthly: 1500 },
  { id: 'openai', label: 'OpenAI', category: 'ai', spendDay: 11.3, spendWeek: 74.2, spendMonth: 302.5, spendYear: 3120.0, venture: 'NI', capMonthly: 500 },
  { id: 'gemini', label: 'Gemini', category: 'ai', spendDay: 3.4, spendWeek: 21.0, spendMonth: 88.4, spendYear: 910.0, venture: 'NI', capMonthly: 200 },
  { id: 'cursor', label: 'Cursor', category: 'ai', spendDay: 6.6, spendWeek: 46.2, spendMonth: 198.0, spendYear: 2376.0, venture: 'NVG', capMonthly: 300 },
  { id: 'harness', label: 'Harness', category: 'infra', spendDay: 2.1, spendWeek: 14.7, spendMonth: 63.0, spendYear: 756.0, venture: 'NVG', capMonthly: null },
  { id: 'github', label: 'GitHub', category: 'infra', spendDay: 1.4, spendWeek: 9.8, spendMonth: 44.0, spendYear: 528.0, venture: 'NVG', capMonthly: null },
  { id: 'supabase', label: 'Supabase', category: 'infra', spendDay: 2.8, spendWeek: 19.6, spendMonth: 84.0, spendYear: 1008.0, venture: 'NI', capMonthly: 150 },
  { id: 'vercel', label: 'Vercel', category: 'infra', spendDay: 3.2, spendWeek: 22.4, spendMonth: 96.0, spendYear: 1152.0, venture: 'NI', capMonthly: 200 },
  { id: 'resend', label: 'Resend', category: 'comms', spendDay: 0.6, spendWeek: 4.2, spendMonth: 18.0, spendYear: 216.0, venture: 'NI', capMonthly: 50 },
  { id: 'serpapi', label: 'SerpAPI', category: 'data', spendDay: 1.1, spendWeek: 7.7, spendMonth: 33.0, spendYear: 396.0, venture: 'NI', capMonthly: 75 },
  { id: 'buffer', label: 'Buffer', category: 'comms', spendDay: 0.5, spendWeek: 3.5, spendMonth: 15.0, spendYear: 180.0, venture: 'NCC', capMonthly: null },
  { id: 'higgsfield', label: 'Higgsfield', category: 'creative', spendDay: 4.9, spendWeek: 34.3, spendMonth: 147.0, spendYear: 1764.0, venture: 'NCC', capMonthly: 250 },
  { id: 'heygen', label: 'HeyGen', category: 'creative', spendDay: 3.7, spendWeek: 25.9, spendMonth: 111.0, spendYear: 1332.0, venture: 'NCC', capMonthly: 200 },
  { id: 'ollama', label: 'Ollama / local', category: 'local', spendDay: 0.0, spendWeek: 0.0, spendMonth: 0.0, spendYear: 0.0, venture: 'Unknown', capMonthly: null },
];

export const USAGE_VENTURES = ['NVG', 'NI', 'NFI', 'NCC', 'Unknown'] as const;

/* ------------------------------------------------------------------ *
 * Reddit Queues
 * ------------------------------------------------------------------ */

export const REDDIT_ACCOUNT = 'u/Own-Basil8147';

export type TelegramApprovalStatus = 'awaiting' | 'approved' | 'rejected';

export interface RedditQueueItem {
  id: string;
  kind: 'promo' | 'reply';
  subreddit: string;
  title: string;
  body: string;
  parentContext?: string;
  telegramStatus: TelegramApprovalStatus;
  createdAt: string;
}

export const REDDIT_PROMO_QUEUE: RedditQueueItem[] = [
  {
    id: 'rp-1',
    kind: 'promo',
    subreddit: 'r/smallbusiness',
    title: 'How we cut 12 hours/week of ops busywork with one intelligence layer',
    body: 'Sharing the exact workflow we built for a services team — happy to answer questions.',
    telegramStatus: 'awaiting',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'rp-2',
    kind: 'promo',
    subreddit: 'r/Entrepreneur',
    title: 'The unsexy AI wins: reconciliation, routing, and reporting',
    body: 'No agents doing your job. Just the boring 80% automated so you do the 20% that matters.',
    telegramStatus: 'approved',
    createdAt: new Date().toISOString(),
  },
];

export const REDDIT_REPLY_QUEUE: RedditQueueItem[] = [
  {
    id: 'rr-1',
    kind: 'reply',
    subreddit: 'r/artificial',
    title: 'Reply to: "Is AI automation worth it for a 5-person team?"',
    body: 'Depends on where your hours go. If reporting + follow-up eats a day a week, yes. Here\u2019s how to scope it.',
    parentContext: 'OP asking whether small teams see ROI from automation.',
    telegramStatus: 'awaiting',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'rr-2',
    kind: 'reply',
    subreddit: 'r/consulting',
    title: 'Reply to: "How do you package an AI audit?"',
    body: 'We scope by decision points, not tools. Map the 5 decisions that move revenue, then instrument those.',
    parentContext: 'Thread on productizing AI advisory work.',
    telegramStatus: 'rejected',
    createdAt: new Date().toISOString(),
  },
];
