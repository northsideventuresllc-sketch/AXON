export interface ItQuickLink {
  slug: string;
  name: string;
  href: string;
  price: string;
}

/** Live NI Intelligence Tools — AXON sidebar quick links (Outline.md IT table). */
export const IT_QUICK_LINKS: ItQuickLink[] = [
  {
    slug: 'replyflow',
    name: 'ReplyFlow',
    href: 'https://northsideintelligence.com/tools/replyflow',
    price: '$15/mo',
  },
  {
    slug: 'grantbot',
    name: 'GrantBot',
    href: 'https://northsideintelligence.com/tools/grantbot',
    price: '$39/mo',
  },
  {
    slug: 'signaldesk',
    name: 'SignalDesk',
    href: 'https://northsideintelligence.com/tools/signaldesk',
    price: '$24/mo',
  },
  {
    slug: 'gapscan',
    name: 'GapScan',
    href: 'https://northsideintelligence.com/tools/gapscan',
    price: '$18/mo',
  },
  {
    slug: 'bridgeai',
    name: 'BridgeAI',
    href: 'https://northsideintelligence.com/tools/bridgeai',
    price: '$29/mo',
  },
];
