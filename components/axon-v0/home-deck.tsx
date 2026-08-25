'use client';

import { OrbHome } from './orb-home';
import { VentureCarousel } from './venture-carousel';
import { NotificationsBoard } from './notifications-board';
import { QuickLinksRail } from './quick-links-rail';
import { ShortcutsPanel } from './shortcuts-panel';
import { UsageBar } from './usage-bar';
import { MasterTodo } from './master-todo';
import { WindowHost, type HostPanel } from './window-host';

export function HomeDeck() {
  const panels: HostPanel[] = [
    { id: 'todo', title: 'Master To-Do', node: <MasterTodo bare />, span: 1 },
    { id: 'notifications', title: 'Notifications', node: <NotificationsBoard bare />, span: 1 },
    { id: 'usage', title: 'Usage', node: <UsageBar bare />, span: 1 },
    { id: 'shortcuts', title: 'Shortcuts', node: <ShortcutsPanel bare />, span: 1 },
    { id: 'quicklinks', title: 'Quick Links', node: <QuickLinksRail bare />, span: 1 },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <OrbHome />
      <VentureCarousel />
      <div className="mt-8">
        <WindowHost panels={panels} />
      </div>
    </div>
  );
}
