'use client';

import { useAxonToolDisplayNames } from '@/lib/use-axon-tool-display-names';

export function AxonToolNameSettings() {
  const { tools, getDisplayName, setDisplayName } = useAxonToolDisplayNames();

  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
      <h2 className="text-sm font-medium">AXON&apos;s Tools — display names</h2>
      <p className="mt-1 text-xs text-axon-muted">
        Customize how tools appear in the sidebar. Saved in this browser until AXON cloud sync (Phase 2a).
      </p>
      <div className="mt-4 space-y-4">
        {tools.map((tool) => (
          <label key={tool.slug} className="block">
            <span className="text-xs text-axon-muted">{tool.defaultDisplayName}</span>
            <input
              type="text"
              defaultValue={getDisplayName(tool)}
              onBlur={(e) => setDisplayName(tool.slug, e.target.value)}
              className="mt-1 w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-axon-text outline-none transition focus:border-axon-blue-glow/50"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
