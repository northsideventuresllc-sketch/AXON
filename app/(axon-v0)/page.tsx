/**
 * The Dash home screen is THE FACE — the brain orb, not a tab you have to find.
 * Build Plan B, step 1 (JB, 2026-09-06: "The Face shouldn't be a tab").
 *
 * The old home deck still exists, unchanged, at /deck (app/(axon-v0)/deck/page.tsx) until
 * step 2 folds its cards around the orb. /face permanently redirects here.
 */
import { FaceHero } from '@/components/axon-v0/face-hero';

export const dynamic = 'force-dynamic';

export default function AxonV0Home() {
  return <FaceHero />;
}
