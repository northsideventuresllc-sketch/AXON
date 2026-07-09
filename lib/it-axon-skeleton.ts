/**
 * AXON IT Skeleton Config — NORTHSiDE Intelligence Tools (live ITs).
 *
 * Tracks per-IT skeleton setup state for the AXON sidebar and future IT-clone
 * tool panels. Complements `lib/it-quick-links.ts` (sidebar external links)
 * and `lib/axon-user-tools.ts` (sourceType: 'it_clone' entries).
 *
 * ARM3 autonomous change pipeline hook (hermes-agent-dispatch.yml in nv-vault):
 *   When adding a new IT to AXON, the following are required:
 *   1. Add an ItAxonSkeletonConfig entry here (skeletonStatus: 'stub').
 *   2. Add a matching ItQuickLink in lib/it-quick-links.ts.
 *   3. Register an AxonUserTool with sourceType: 'it_clone' in
 *      lib/axon-user-tools.ts and seed the matching row in axon_user_tools.
 *   4. Create app/(dashboard)/tools/{slug}/page.tsx (ToolPlaceholder is fine
 *      at 'stub'; promote to 'wired' once the route exists).
 *   5. Add lib/it-axon-skeleton.ts to the paths block of
 *      .github/workflows/sync-ni-portal.yml so portal UI syncs on changes.
 *   6. If Hermes agent-dispatch is used for IT tasks, ensure the dispatch
 *      row code contains the slug so deriveVenture() maps it correctly.
 *
 * Sector reference: NI portal tailwind uses "sector3-loading" animation for
 * IT tool panels — this maps to the NI portal Sector 3 theme layer.
 */

export type ItSkeletonStatus =
  /** Skeleton config only — no AXON route or tool panel yet. */
  | 'stub'
  /** Route + ToolPlaceholder wired; sidebar link active. */
  | 'wired'
  /** Full IT-clone tool panel live in AXON. */
  | 'live';

export interface ItAxonSkeletonConfig {
  /** Lowercase kebab slug matching IT_QUICK_LINKS and the AXON route. */
  slug: string;
  /** Display name — exact brand casing. */
  name: string;
  /** External URL to the IT's page on northsideintelligence.com. */
  itHref: string;
  /**
   * Default AXON prompt shown when a user opens this IT tool panel.
   * Should orient AXON on the tool's purpose so it can assist without
   * extra context from the operator.
   */
  defaultPrompt: string;
  /** Current skeleton setup phase. */
  skeletonStatus: ItSkeletonStatus;
}

/**
 * Canonical skeleton configs for all five live NI Intelligence Tools.
 *
 * Mirrors slug/name/href parity with IT_QUICK_LINKS in lib/it-quick-links.ts.
 * Update skeletonStatus as each IT progresses through the AXON integration
 * pipeline: stub → wired → live.
 */
export const IT_SKELETON_CONFIGS: ItAxonSkeletonConfig[] = [
  {
    slug: 'replyflow',
    name: 'ReplyFlow',
    itHref: 'https://northsideintelligence.com/tools/replyflow',
    defaultPrompt:
      'You are helping JB manage ReplyFlow — NORTHSiDE\'s AI-powered reply and follow-up automation tool ($15/mo). ' +
      'Assist with reviewing reply queues, drafting follow-up copy, and tracking reply performance metrics. ' +
      'Surface anything that needs approval before sending.',
    skeletonStatus: 'stub',
  },
  {
    slug: 'grantbot',
    name: 'GrantBot',
    itHref: 'https://northsideintelligence.com/tools/grantbot',
    defaultPrompt:
      'You are helping JB manage GrantBot — NORTHSiDE\'s AI grant-discovery and application drafting tool ($39/mo). ' +
      'Help surface relevant grant opportunities, review draft applications, and track submission deadlines. ' +
      'Flag high-priority grants that need JB\'s review.',
    skeletonStatus: 'stub',
  },
  {
    slug: 'signaldesk',
    name: 'SignalDesk',
    itHref: 'https://northsideintelligence.com/tools/signaldesk',
    defaultPrompt:
      'You are helping JB manage SignalDesk — NORTHSiDE\'s AI market-signal monitoring desk ($24/mo). ' +
      'Surface new signals, competitor moves, and industry alerts that are relevant to NORTHSiDE ventures. ' +
      'Highlight anything actionable that warrants a same-day response.',
    skeletonStatus: 'stub',
  },
  {
    slug: 'gapscan',
    name: 'GapScan',
    itHref: 'https://northsideintelligence.com/tools/gapscan',
    defaultPrompt:
      'You are helping JB manage GapScan — NORTHSiDE\'s AI market-gap analysis scanner ($18/mo). ' +
      'Help review gap reports, score opportunity quality, and map findings to NORTHSiDE service offerings. ' +
      'Prioritise gaps that align with the current ICP and outreach pipeline.',
    skeletonStatus: 'stub',
  },
  {
    slug: 'bridgeai',
    name: 'BridgeAI',
    itHref: 'https://northsideintelligence.com/tools/bridgeai',
    defaultPrompt:
      'You are helping JB manage BridgeAI — NORTHSiDE\'s AI integration and workflow-bridge tool ($29/mo). ' +
      'Assist with mapping integration tasks, reviewing connection health, and surfacing workflow bottlenecks. ' +
      'Flag any broken bridges or stalled automations that need immediate attention.',
    skeletonStatus: 'stub',
  },
];

/** Quick lookup by slug. Returns undefined if slug is not a configured IT. */
export function getItSkeletonBySlug(slug: string): ItAxonSkeletonConfig | undefined {
  return IT_SKELETON_CONFIGS.find((it) => it.slug === slug);
}

/** All IT slugs in display order. */
export const IT_SLUGS = IT_SKELETON_CONFIGS.map((it) => it.slug);
