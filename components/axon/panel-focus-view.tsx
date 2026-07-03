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

  const leftGhost = active === 'briefing' ? chatGhost : briefing;
  const center = active === 'briefing' ? briefing : todo;
  const rightGhost = active === 'briefing' ? todo : chatGhost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-axon-bg/75 backdrop-blur-md p-4">
      <div className="flex w-full max-w-6xl items-center justify-center gap-4 perspective-[1200px]">
        <div className="hidden w-[22%] shrink-0 opacity-30 blur-[1px] transition-all lg:block axon-panel-ghost-left">
          {leftGhost}
        </div>

        <div className="axon-panel-focus-center w-full max-w-2xl lg:w-[52%] min-h-[480px]">
          {center}
        </div>

        <div className="hidden w-[22%] shrink-0 opacity-30 blur-[1px] transition-all lg:block axon-panel-ghost-right">
          {rightGhost}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-axon-blue/40 bg-axon-elevated/90 px-8 py-2.5 text-sm text-axon-cyan transition hover:border-axon-cyan hover:bg-axon-blue/20"
      >
        ← Back to command view
      </button>
    </div>
  );
}
