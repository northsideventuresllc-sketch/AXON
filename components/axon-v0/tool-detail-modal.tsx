'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export interface ToolkitToolView {
  slug: string;
  name: string;
  icon: string;
  sourceType: 'outreach_engine' | 'it_clone' | 'custom';
  href?: string;
  /** How it works — from getAxonToolMeta(tool).setupDescription or custom notes. */
  setupDescription: string;
  isCustom: boolean;
  /** Ventures this tool is plugged into, for the preview link. */
  usedBy: Array<{ id: string; name: string }>;
}

const SOURCE_LABEL: Record<ToolkitToolView['sourceType'], string> = {
  outreach_engine: 'Outreach Engine',
  it_clone: 'IT Clone',
  custom: 'Custom Tool',
};

export function ToolDetailModal({
  tool,
  onClose,
  onPlugIn,
}: {
  tool: ToolkitToolView;
  onClose: () => void;
  onPlugIn: (slug: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const previewTarget = tool.usedBy[0] ? `/v/${tool.usedBy[0].id}` : '/toolkit#assign';

  return (
    <div
      className="tk-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${tool.name} details`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tk-modal v0-panel v0-scroll p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="tk-icon-badge">{tool.icon}</span>
            <div>
              <h2 className="text-lg text-slate-100">{tool.name}</h2>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                <span className={`tk-source-dot tk-src-${tool.sourceType}`} />
                {SOURCE_LABEL[tool.sourceType]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="v0-chip text-slate-300 hover:text-cyan-200"
          >
            ✕
          </button>
        </div>

        <div className="mt-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">How it works</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{tool.setupDescription}</p>
        </div>

        {tool.usedBy.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Plugged into</p>
            <p className="mt-2 text-sm text-slate-400">
              {tool.usedBy.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ' · '}
                  <Link href={`/v/${v.id}`} className="text-cyan-300/80 hover:text-cyan-200">
                    {v.name}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2 border-t border-cyan-400/10 pt-4">
          <button
            onClick={() => onPlugIn(tool.slug)}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-400/20"
          >
            ＋ Plug into a venture
          </button>
          <Link
            href={previewTarget}
            className="rounded-lg border border-cyan-400/20 bg-black/40 px-3 py-2 text-sm text-cyan-200/90 hover:border-cyan-400/50"
          >
            Preview in your ventures →
          </Link>
          {tool.href && !tool.isCustom && (
            <Link
              href={tool.href}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-300 hover:border-cyan-400/40"
            >
              Open tool ↗
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
