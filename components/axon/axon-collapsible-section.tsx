'use client';

import { useState, type ReactNode } from 'react';

export function AxonCollapsibleSection({
  title,
  defaultOpen = true,
  maxHeightClass = 'max-h-48',
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  maxHeightClass?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3 border-t border-axon-border/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between px-3 text-[10px] uppercase tracking-[0.2em] text-axon-muted hover:text-axon-text"
      >
        <span>{title}</span>
        <span className="text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className={`${maxHeightClass} space-y-1 overflow-y-auto overflow-x-hidden pr-1 axon-sidebar-scroll`}>
          {children}
        </div>
      )}
    </div>
  );
}
