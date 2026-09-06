/**
 * The old Dash home deck, unchanged — it just moved off `/` when THE FACE became the home
 * screen. Step 2 of Build Plan B folds these cards around the orb and this route retires.
 */
import { HomeDeck } from '@/components/axon-v0/home-deck';

export const dynamic = 'force-dynamic';

export default function AxonV0Deck() {
  return <HomeDeck />;
}
