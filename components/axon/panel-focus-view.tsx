'use client';

import type { ReactNode } from 'react';

export type FocusPanelId = 'briefing' | 'todo';

interface PanelFocusViewProps {
  active: FocusPanelId | null;
  onClose: () => void;
  briefing: ReactNode;
  todo: ReactNode;
  chatGhost: ReactNode;
}

export function PanelFocusView({
  active,
  onClose,
  briefing,
  todo,
  chatGhost,
}: PanelFocusViewProps) {
  if (!active) return null;

  const fromLeft = active === 'briefing';
  const leftGhost = fromLeft ? chatGhost : briefing;
  const center = fromLeft ? briefing : todo;
  const rightGhost = fromLeft ? todo : chatGhost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-axon-bg/75 backdrop-blur-md p-4">
      <div className="flex w-full max-w-6xl items-center justify-center gap-4 perspective-[1200px]">
        <div
          className={`hidden w-[22%] shrink-0 opacity-30 blur-[1px] transition-all lg:block ${
            fromLeft ? 'axon-panel-ghost-left' : 'axon-panel-ghost-left-subtle'
          }`}
        >
          {leftGhost}
        </div>

        <div
          className={`w-full max-w-2xl lg:w-[52%] min-h-[480px] ${
            fromLeft ? 'axon-panel-focus-from-left' : 'axon-panel-focus-from-right'
          }`}
        >
          {center}
        </div>

        <div
          className={`hidden w-[22%] shrink-0 opacity-30 blur-[1px] transition-all lg:block ${
            fromLeft ? 'axon-panel-ghost-right-subtle' : 'axon-panel-ghost-right'
          }`}
        >
          {rightGhost}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-axon-blue/40 bg-axon-elevated/90 px-8 py-2.5 text-sm text-axon-cyan transition hover:border-axon-cyan hover:bg-axon-blue/20"
      >
        ← BACK TO COMMAND CENTER
      </button>
    </div>
  );
}
